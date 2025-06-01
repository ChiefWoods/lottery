import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Lottery } from "../target/types/lottery";
import { BN, Program } from "@coral-xyz/anchor";
import { SbOnDemand } from "./fixtures/sb_on_demand";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { defundKeypair, fundKeypair, getSetup } from "./setup";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  getCollectionMintPdaAndBump,
  getLotteryPdaAndBump,
  getTicketMintPda,
} from "./pda";
import { getLotteryAcc } from "./accounts";
import {
  fetchDigitalAssetByMetadata,
  fetchMasterEdition,
  findMasterEditionPda,
  findMetadataPda,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey, Umi } from "@metaplex-foundation/umi";
import { ON_DEMAND_DEVNET_QUEUE, Randomness } from "@switchboard-xyz/on-demand";
import { BASE_FEE } from "./constants";

describe("lottery", () => {
  let { program, onDemandProgram, umi } = {} as {
    program: Program<Lottery>;
    onDemandProgram: Program<SbOnDemand>;
    umi: Umi;
  };

  let connection: Connection;
  const tokenProgram = TOKEN_2022_PROGRAM_ID;

  const [authority, buyer1, buyer2] = Array.from({ length: 3 }).map(
    Keypair.generate,
  );
  const [collectionMintPda, collectionMintBump] = getCollectionMintPdaAndBump(
    authority.publicKey,
  );
  const [lotteryPda, lotteryBump] = getLotteryPdaAndBump(collectionMintPda);
  let winningIndex: number;

  beforeAll(async () => {
    ({ program, onDemandProgram, umi } = getSetup());
    connection = program.provider.connection;
    for (const kp of [authority, buyer1, buyer2]) {
      await fundKeypair(kp.publicKey);
    }
  });

  test("initialize lottery", async () => {
    const now = Date.now() / 1000;
    const startTime = new BN(now); // now
    const endTime = new BN(now + 5); // now + 5 secs
    const price = new BN(10000);
    const name = "Test Lottery";
    const symbol = "TEST";
    const uri = "https://example.com";

    const ix = await program.methods
      .initializeLottery({
        startTime,
        endTime,
        price,
        name,
        symbol,
        uri,
      })
      .accounts({
        authority: authority.publicKey,
        tokenProgram,
      })
      .instruction();

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    const message = new TransactionMessage({
      payerKey: authority.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message([]);

    const tx = new VersionedTransaction(message);
    tx.sign([authority]);

    const signature = await connection.sendTransaction(tx);

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

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

    const collectionMintAtaPubkey = getAssociatedTokenAddressSync(
      collectionMintPda,
      lotteryPda,
      true,
      tokenProgram,
    );
    const collectionMintAta = await getAccount(
      connection,
      collectionMintAtaPubkey,
      "confirmed",
      tokenProgram,
    );

    expect(collectionMintAta.amount).toBe(BigInt(1));

    const collectionMintPubkey = publicKey(collectionMintPda);

    const metadataPda = findMetadataPda(umi, { mint: collectionMintPubkey });
    const metadataAcc = await fetchDigitalAssetByMetadata(umi, metadataPda);

    expect(metadataAcc.metadata.name).toBe(name);
    expect(metadataAcc.metadata.symbol).toBe(symbol);
    expect(metadataAcc.metadata.uri).toBe(uri);

    const masterEditionPda = findMasterEditionPda(umi, {
      mint: collectionMintPubkey,
    });
    const masterEditionAcc = await fetchMasterEdition(umi, masterEditionPda);

    //@ts-ignore
    expect(masterEditionAcc.maxSupply.value).toBe(BigInt(0));
  });

  test("buys a ticket", async () => {
    const preLotteryBal = await connection.getBalance(lotteryPda);

    const ix1 = await program.methods
      .buyTicket()
      .accounts({
        buyer: buyer1.publicKey,
        lottery: lotteryPda,
        tokenProgram,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 400000,
        }),
      ])
      .instruction();

    let { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    const message1 = new TransactionMessage({
      payerKey: buyer1.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix1],
    }).compileToV0Message([]);

    const tx1 = new VersionedTransaction(message1);
    tx1.sign([buyer1]);

    let signature = await connection.sendTransaction(tx1);

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    const lotteryAcc = await getLotteryAcc(program, lotteryPda);

    expect(lotteryAcc.potAmount.toNumber()).toBe(lotteryAcc.price.toNumber());
    expect(lotteryAcc.index.toNumber()).toBe(1);

    const postLotteryBal = await connection.getBalance(lotteryPda);

    expect(postLotteryBal).toBe(preLotteryBal + lotteryAcc.price.toNumber());

    const ticketMintPda = getTicketMintPda(lotteryPda, new BN(0));
    const ticketMintAtaPubkey = getAssociatedTokenAddressSync(
      ticketMintPda,
      buyer1.publicKey,
      false,
      tokenProgram,
    );
    const ticketMintAta = await getAccount(
      connection,
      ticketMintAtaPubkey,
      "confirmed",
      tokenProgram,
    );

    expect(ticketMintAta.amount).toEqual(BigInt(1));

    // buys second ticket

    const ix2 = await program.methods
      .buyTicket()
      .accounts({
        buyer: buyer2.publicKey,
        lottery: lotteryPda,
        tokenProgram,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 400000,
        }),
      ])
      .instruction();

    ({ blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash());

    const message2 = new TransactionMessage({
      payerKey: buyer2.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix2],
    }).compileToV0Message([]);

    const tx2 = new VersionedTransaction(message2);
    tx2.sign([buyer2]);

    signature = await connection.sendTransaction(tx2);

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });
  });

  test("commit and choose a winner", async () => {
    const [randomness, rngKp, ixs] = await Randomness.createAndCommitIxs(
      //@ts-ignore
      onDemandProgram,
      ON_DEMAND_DEVNET_QUEUE,
      authority.publicKey,
    );

    const ix1 = await program.methods
      .commitWinner()
      .accountsPartial({
        authority: authority.publicKey,
        lottery: lotteryPda,
        randomness: randomness.pubkey,
        tokenProgram,
      })
      .instruction();

    let { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    const message1 = new TransactionMessage({
      payerKey: authority.publicKey,
      recentBlockhash: blockhash,
      instructions: [...ixs, ix1],
    }).compileToV0Message([]);

    const tx1 = new VersionedTransaction(message1);
    tx1.sign([authority, rngKp]);

    let signature = await connection.sendTransaction(tx1);

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    let lotteryAcc = await getLotteryAcc(program, lotteryPda);

    expect(lotteryAcc.randomness).toStrictEqual(randomness.pubkey);

    const revealIx = await randomness.revealIx(authority.publicKey);

    const ix2 = await program.methods
      .chooseWinner()
      .accountsPartial({
        authority: authority.publicKey,
        lottery: lotteryPda,
        randomness: randomness.pubkey,
        tokenProgram,
      })
      .instruction();

    ({ blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash());

    const message2 = new TransactionMessage({
      payerKey: authority.publicKey,
      recentBlockhash: blockhash,
      instructions: [revealIx, ix2],
    }).compileToV0Message([]);

    const tx2 = new VersionedTransaction(message2);
    tx2.sign([authority]);

    signature = await connection.sendTransaction(tx2);

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    lotteryAcc = await getLotteryAcc(program, lotteryPda);

    winningIndex = lotteryAcc.winningIndex.toNumber();

    expect(lotteryAcc.winnerChosen).toBeTruthy();
  });

  test("claim prize", async () => {
    const winner = winningIndex === 0 ? buyer1 : buyer2;

    let lotteryAcc = await getLotteryAcc(program, lotteryPda);
    const prePotAmount = lotteryAcc.potAmount.toNumber();
    const preWinnerBal = await connection.getBalance(winner.publicKey);
    const preLotteryBal = await connection.getBalance(lotteryPda);

    const ix = await program.methods
      .claimPrize()
      .accountsPartial({
        winner: winner.publicKey,
        lottery: lotteryPda,
        tokenProgram,
      })
      .instruction();

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    const message = new TransactionMessage({
      payerKey: winner.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message([]);

    const tx = new VersionedTransaction(message);
    tx.sign([winner]);

    const signature = await connection.sendTransaction(tx);

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    lotteryAcc = await getLotteryAcc(program, lotteryPda);
    const postPotAmount = lotteryAcc.potAmount.toNumber();
    const postWinnerBal = await connection.getBalance(winner.publicKey);
    const postLotteryBal = await connection.getBalance(lotteryPda);

    expect(postPotAmount).toEqual(0);
    expect(postWinnerBal).toBeLessThanOrEqual(
      preWinnerBal + prePotAmount + BASE_FEE,
    );
    expect(postLotteryBal).toEqual(preLotteryBal - prePotAmount);

    const ticketMintPda = getTicketMintPda(lotteryPda, new BN(winningIndex));
    const ticketMintAta = getAssociatedTokenAddressSync(
      ticketMintPda,
      winner.publicKey,
      false,
      tokenProgram,
    );
    const ticketMintAtaAcc = await getAccount(
      connection,
      ticketMintAta,
      "confirmed",
      tokenProgram,
    );

    expect(Number(ticketMintAtaAcc.amount)).toEqual(1);
  });

  afterAll(async () => {
    for (const kp of [authority, buyer1, buyer2]) {
      await defundKeypair(kp);
    }
  });
});
