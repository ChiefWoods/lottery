import { BankrunProvider } from "anchor-bankrun";
import { beforeEach, describe, expect, test } from "bun:test";
import { Clock, ProgramTestContext } from "solana-bankrun";
import { Lottery } from "../../target/types/lottery";
import { AnchorError, BN, Idl, Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { getBankrunSetup } from "../setup";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getCollectionMintPdaAndBump, getLotteryPdaAndBump } from "../pda";
import { getLotteryAcc } from "../accounts";
import { SbOnDemand } from "../fixtures/sd_on_demand";
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
      })
    ));

    const { unixTimestamp } = await context.banksClient.getClock();

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

    const { epoch, epochStartTimestamp, leaderScheduleEpoch, slot } =
      await context.banksClient.getClock();

    const newTime = BigInt(startTime.toNumber());
    const clock = new Clock(
      slot,
      epochStartTimestamp,
      epoch,
      leaderScheduleEpoch,
      newTime
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
      queue.pubkey
    );

    await program.methods
      .commitWinner()
      .accounts({
        randomnessAccountData: randomness.pubkey,
        tokenProgram,
      })
      .preInstructions(ixs)
      .signers([authority, rngKp])
      .rpc();
  });

  test.skip("choose a winner", async () => {
    const { epoch, epochStartTimestamp, leaderScheduleEpoch, slot } =
      await context.banksClient.getClock();

    const newTime = BigInt(endTime.toNumber());
    const clock = new Clock(
      slot,
      epochStartTimestamp,
      epoch,
      leaderScheduleEpoch,
      newTime
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

    const lotteryAcc = await getLotteryAcc(program, lotteryPda);

    console.log(lotteryAcc.winningIndex.toNumber());
    expect(lotteryAcc.winnerChosen).toBeTruthy();
  });

  test.skip("throws if wrong randomness account passed", async () => {
    const { epoch, epochStartTimestamp, leaderScheduleEpoch, slot } =
      await context.banksClient.getClock();

    const newTime = BigInt(endTime.toNumber());
    const clock = new Clock(
      slot,
      epochStartTimestamp,
      epoch,
      leaderScheduleEpoch,
      newTime
    );
    context.setClock(clock);

    const ix = await randomness.revealIx();

    try {
      await program.methods
        .chooseWinner()
        .accountsPartial({
          lottery: lotteryPda,
          randomnessAccountData: PublicKey.default,
          tokenProgram,
        })
        .preInstructions([ix])
        .signers([authority])
        .rpc();
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("IncorrectRandomnessAccount");
      expect(error.errorCode.number).toEqual(6008);
    }
  });

  test.skip("throws if lottery has not ended", async () => {
    const ix = await randomness.revealIx();

    try {
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
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("LotteryNotEnded");
      expect(error.errorCode.number).toEqual(6002);
    }
  });

  test.skip("throws if winner has already been chosen", async () => {
    const { epoch, epochStartTimestamp, leaderScheduleEpoch, slot } =
      await context.banksClient.getClock();

    const newTime = BigInt(endTime.toNumber());
    const clock = new Clock(
      slot,
      epochStartTimestamp,
      epoch,
      leaderScheduleEpoch,
      newTime
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

    try {
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
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("WinnerAlreadyChosen");
      expect(error.errorCode.number).toEqual(6003);
    }
  });
});
