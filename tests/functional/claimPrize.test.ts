import { BankrunProvider } from "anchor-bankrun";
import { beforeEach, describe, expect, test } from "bun:test";
import { Clock, ProgramTestContext } from "solana-bankrun";
import { Lottery } from "../../target/types/lottery";
import { AnchorError, BN, Idl, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getBankrunSetup } from "../setup";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  getCollectionMintPdaAndBump,
  getLotteryPdaAndBump,
  getTicketMintPda,
} from "../pda";
import { getLotteryAcc } from "../accounts";
import { SbOnDemand } from "../fixtures/sb_on_demand";
import { Queue, Randomness } from "@switchboard-xyz/on-demand";

describe("choose a winner", () => {
  let { context, provider, program, sbProgram, queue } = {} as {
    context: ProgramTestContext;
    provider: BankrunProvider;
    program: Program<Lottery>;
    sbProgram: Program<SbOnDemand>;
    queue: Queue;
  };

  const [authority, buyer] = Array.from({ length: 2 }, Keypair.generate);

  const tokenProgram = TOKEN_2022_PROGRAM_ID;

  const [collectionMintPda] = getCollectionMintPdaAndBump();
  const [lotteryPda] = getLotteryPdaAndBump(collectionMintPda);

  let startTime: BN;
  let endTime: BN;
  let randomness: Randomness;
  let rngKp: Keypair;
  let ixs: TransactionInstruction[];

  beforeEach(async () => {
    ({ context, provider, program, sbProgram, queue } = await getBankrunSetup(
      [authority, buyer].map((kp) => {
        return {
          address: kp.publicKey,
          info: {
            lamports: LAMPORTS_PER_SOL * 5,
            data: Buffer.alloc(0),
            owner: SystemProgram.programId,
            executable: false,
          },
        };
      }),
    ));

    const {
      epoch,
      epochStartTimestamp,
      leaderScheduleEpoch,
      slot,
      unixTimestamp,
    } = await context.banksClient.getClock();

    startTime = new BN(Number(unixTimestamp) + 60 * 60 * 24); // 1 day from now
    endTime = new BN(Number(unixTimestamp) + 60 * 60 * 48); // 2 days from now
    const price = new BN(LAMPORTS_PER_SOL / 10000);

    await program.methods
      .initializeLottery({
        startTime,
        endTime,
        price,
        name: "Test Lottery",
        symbol: "TEST",
        uri: "https://example.com",
      })
      .accounts({
        authority: authority.publicKey,
        tokenProgram,
      })
      .signers([authority])
      .rpc();

    let newTime = BigInt(startTime.toNumber());
    let clock = new Clock(
      slot,
      epochStartTimestamp,
      epoch,
      leaderScheduleEpoch,
      newTime,
    );
    context.setClock(clock);

    await program.methods
      .buyTicket()
      .accountsPartial({
        buyer: buyer.publicKey,
        lottery: lotteryPda,
        tokenProgram,
      })
      .signers([buyer])
      .rpc();

    // TODO: test commitWinner

    [randomness, rngKp, ixs] = await Randomness.createAndCommitIxs(
      sbProgram as unknown as Program<Idl>,
      queue.pubkey,
    );

    await program.methods
      .commitWinner()
      .accountsPartial({
        authority: authority.publicKey,
        lottery: lotteryPda,
        randomnessAccountData: randomness.pubkey,
        tokenProgram,
      })
      .preInstructions(ixs)
      .signers([authority, rngKp])
      .rpc();
  });

  test.skip("claim prize", async () => {
    // TODO: test chooseWinner
    let { epoch, epochStartTimestamp, leaderScheduleEpoch, slot } =
      await context.banksClient.getClock();

    const newTime = BigInt(endTime.toNumber());
    const clock = new Clock(
      slot,
      epochStartTimestamp,
      epoch,
      leaderScheduleEpoch,
      newTime,
    );
    context.setClock(clock);

    const ix = await randomness.revealIx();

    await program.methods
      .chooseWinner()
      .accountsPartial({
        lottery: lotteryPda,
        randomnessAccountData: randomness.pubkey,
        tokenProgram,
      })
      .preInstructions([ix])
      .signers([authority])
      .rpc();

    let lotteryAcc = await getLotteryAcc(program, lotteryPda);
    const initPotAmount = lotteryAcc.potAmount.toNumber();
    const initWinnerBal = await context.banksClient.getBalance(buyer.publicKey);
    const initLotteryBal = await context.banksClient.getBalance(lotteryPda);

    await program.methods
      .claimPrize()
      .accountsPartial({
        winner: buyer.publicKey,
        lottery: lotteryPda,
        tokenProgram,
      })
      .signers([buyer])
      .rpc();

    lotteryAcc = await getLotteryAcc(program, lotteryPda);
    const postPotAmount = lotteryAcc.potAmount.toNumber();
    const postWinnerBal = await context.banksClient.getBalance(buyer.publicKey);
    const postLotteryBal = await context.banksClient.getBalance(lotteryPda);

    expect(postPotAmount).toEqual(0);
    expect(Number(postWinnerBal)).toEqual(
      Number(initWinnerBal) + initPotAmount,
    );
    expect(Number(postLotteryBal)).toEqual(
      Number(initLotteryBal) - initPotAmount,
    );

    const ticketMintPda = getTicketMintPda(new BN(0));
    const ticketMintAta = getAssociatedTokenAddressSync(
      ticketMintPda,
      buyer.publicKey,
      false,
      tokenProgram,
    );
    const ticketMintAtaAcc = await getAccount(
      provider.connection,
      ticketMintAta,
      "confirmed",
      tokenProgram,
    );

    expect(Number(ticketMintAtaAcc.amount)).toEqual(1);
  });

  test.skip("throws if winner is not yet chosen", async () => {
    let { epoch, epochStartTimestamp, leaderScheduleEpoch, slot } =
      await context.banksClient.getClock();

    const newTime = BigInt(endTime.toNumber());
    const clock = new Clock(
      slot,
      epochStartTimestamp,
      epoch,
      leaderScheduleEpoch,
      newTime,
    );
    context.setClock(clock);

    const ix = await randomness.revealIx();

    await context.banksClient.processTransaction(new Transaction().add(ix));

    try {
      await program.methods
        .claimPrize()
        .accountsPartial({
          winner: buyer.publicKey,
          lottery: lotteryPda,
          tokenProgram,
        })
        .signers([buyer])
        .rpc();
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("WinnerNotChosen");
      expect(error.errorCode.number).toEqual(6004);
    }
  });
});
