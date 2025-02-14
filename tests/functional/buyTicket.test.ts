import { BankrunProvider } from "anchor-bankrun";
import { beforeEach, describe, expect, test } from "bun:test";
import { Clock, ProgramTestContext } from "solana-bankrun";
import { Lottery } from "../../target/types/lottery";
import { AnchorError, BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
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

describe("buyTicket", () => {
  let { context, provider, program } = {} as {
    context: ProgramTestContext;
    provider: BankrunProvider;
    program: Program<Lottery>;
  };

  const [authority, buyer] = Array.from({ length: 2 }, Keypair.generate);

  const tokenProgram = TOKEN_2022_PROGRAM_ID;

  let startTime: BN;
  let endTime: BN;

  beforeEach(async () => {
    ({ context, provider, program } = await getBankrunSetup(
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

    const clock = await context.banksClient.getClock();

    startTime = new BN(Number(clock.unixTimestamp) + 60 * 60 * 24); // 1 day from now
    endTime = new BN(Number(clock.unixTimestamp) + 60 * 60 * 48); // 2 days from now
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
  });

  test("buys a ticket", async () => {
    const [collectionMintPda] = getCollectionMintPdaAndBump();
    const [lotteryPda] = getLotteryPdaAndBump(collectionMintPda);

    const initLotteryBal = await context.banksClient.getBalance(lotteryPda);

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

    const lotteryAcc = await getLotteryAcc(program, lotteryPda);

    expect(lotteryAcc.potAmount.toNumber()).toEqual(
      lotteryAcc.price.toNumber()
    );
    expect(lotteryAcc.index.toNumber()).toEqual(1);

    const postLotteryBal = await context.banksClient.getBalance(lotteryPda);

    expect(Number(postLotteryBal)).toEqual(
      Number(initLotteryBal) + lotteryAcc.price.toNumber()
    );

    const ticketMintPda = getTicketMintPda(new BN(0));
    const ticketMintAta = getAssociatedTokenAddressSync(
      ticketMintPda,
      buyer.publicKey,
      false,
      tokenProgram
    );
    const ticketMintAtaAcc = await getAccount(
      provider.connection,
      ticketMintAta,
      "confirmed",
      tokenProgram
    );

    expect(Number(ticketMintAtaAcc.amount)).toEqual(1);
  });

  test("throws when buying a ticket before lottery has started", async () => {
    const { epoch, epochStartTimestamp, leaderScheduleEpoch, slot } =
      await context.banksClient.getClock();

    const newTime = BigInt(startTime.toNumber() - 1);
    const clock = new Clock(
      slot,
      epochStartTimestamp,
      epoch,
      leaderScheduleEpoch,
      newTime
    );
    context.setClock(clock);

    const [collectionMintPda] = getCollectionMintPdaAndBump();
    const [lotteryPda] = getLotteryPdaAndBump(collectionMintPda);

    try {
      await program.methods
        .buyTicket()
        .accountsPartial({
          buyer: buyer.publicKey,
          lottery: lotteryPda,
          tokenProgram,
        })
        .signers([buyer])
        .rpc();
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("LotteryNotStarted");
      expect(error.errorCode.number).toEqual(6000);
    }
  });

  test("throws when buying a ticket after lottery has ended", async () => {
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

    const [collectionMintPda] = getCollectionMintPdaAndBump();
    const [lotteryPda] = getLotteryPdaAndBump(collectionMintPda);

    try {
      await program.methods
        .buyTicket()
        .accountsPartial({
          buyer: buyer.publicKey,
          lottery: lotteryPda,
          tokenProgram,
        })
        .signers([buyer])
        .rpc();
    } catch (err) {
      expect(err).toBeInstanceOf(AnchorError);

      const { error } = err as AnchorError;
      expect(error.errorCode.code).toEqual("LotteryHasEnded");
      expect(error.errorCode.number).toEqual(6001);
    }
  });
});
