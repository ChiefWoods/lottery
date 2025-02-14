import { BankrunProvider } from "anchor-bankrun";
import { beforeEach, describe, expect, test } from "bun:test";
import { ProgramTestContext } from "solana-bankrun";
import { Lottery } from "../../target/types/lottery";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { getBankrunSetup } from "../setup";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getCollectionMintPdaAndBump, getLotteryPdaAndBump } from "../pda";
import { getLotteryAcc } from "../accounts";

describe("initializeLottery", () => {
  let { context, provider, program } = {} as {
    context: ProgramTestContext;
    provider: BankrunProvider;
    program: Program<Lottery>;
  };

  const authority = Keypair.generate();

  beforeEach(async () => {
    ({ context, provider, program } = await getBankrunSetup([
      {
        address: authority.publicKey,
        info: {
          lamports: LAMPORTS_PER_SOL * 5,
          data: Buffer.alloc(0),
          owner: SystemProgram.programId,
          executable: false,
        },
      },
    ]));
  });

  test("initialize a lottery", async () => {
    const clock = await context.banksClient.getClock();

    const startTime = new BN(Number(clock.unixTimestamp) + 60 * 60 * 24); // 1 day from now
    const endTime = new BN(Number(clock.unixTimestamp) + 60 * 60 * 48); // 2 days from now
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
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([authority])
      .rpc();

    const [collectionMintPda, collectionMintBump] =
      getCollectionMintPdaAndBump();
    const [lotteryPda, lotteryBump] = getLotteryPdaAndBump(collectionMintPda);
    const lotteryAcc = await getLotteryAcc(program, lotteryPda);

    expect(lotteryAcc.winnerChosen).toEqual(false);
    expect(lotteryAcc.bump).toEqual(lotteryBump);
    expect(lotteryAcc.collectionMintBump).toEqual(collectionMintBump);
    expect(lotteryAcc.startTime).toStrictEqual(startTime);
    expect(lotteryAcc.endTime).toStrictEqual(endTime);
    expect(lotteryAcc.index.toNumber()).toEqual(0);
    expect(lotteryAcc.winningIndex.toNumber()).toEqual(0);
    expect(lotteryAcc.price.toNumber()).toEqual(price.toNumber());
    expect(lotteryAcc.potAmount.toNumber()).toStrictEqual(0);
    expect(lotteryAcc.authority).toStrictEqual(authority.publicKey);
    expect(lotteryAcc.collectionMint).toStrictEqual(collectionMintPda);
  });
});
