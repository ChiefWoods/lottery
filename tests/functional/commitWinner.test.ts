import { BankrunProvider } from "anchor-bankrun";
import { beforeEach, describe, expect, test } from "bun:test";
import { Clock, ProgramTestContext } from "solana-bankrun";
import { Lottery } from "../../target/types/lottery";
import { BN, Idl, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { getBankrunSetup } from "../setup";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getCollectionMintPdaAndBump, getLotteryPdaAndBump } from "../pda";
import { getLotteryAcc } from "../accounts";
import { SbOnDemand } from "../fixtures/sd_on_demand";
import { Queue, Randomness } from "@switchboard-xyz/on-demand";

describe("commitWInner", () => {
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
  });

  test.skip("commit a winner", async () => {
    // TODO: getSlot is under provider.connection.banksClient.getSlot, not provider.connection.getSlot
    const [randomness, rngKp, ixs] = await Randomness.createAndCommitIxs(
      sbProgram as Program<Idl>,
      queue.pubkey
    );

    await program.methods
      .commitWinner()
      .accountsPartial({
        lottery: lotteryPda,
        randomnessAccountData: randomness.pubkey,
        tokenProgram,
      })
      .preInstructions(ixs)
      .signers([authority, rngKp])
      .rpc();

    const lotteryAcc = await getLotteryAcc(program, lotteryPda);

    expect(lotteryAcc.randomnessAccountData).toStrictEqual(randomness.pubkey);
  });
});
