import { BN, Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  AddressLookupTableProgram,
  clusterApiUrl,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  Gateway,
  Oracle,
  Queue,
  Randomness,
  RandomnessRevealResponse,
  SOL_NATIVE_MINT,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  SPL_SYSVAR_SLOT_HASHES_ID,
  SPL_TOKEN_PROGRAM_ID,
  State,
} from "@switchboard-xyz/on-demand";
import { SbOnDemand } from "./fixtures/sb_on_demand";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

function getLutSignerPda(programId: PublicKey, pubkey: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("LutSigner"), pubkey.toBuffer()],
    programId,
  )[0];
}

function getOracleRandomessStatsPda(programId: PublicKey, oracle: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("OracleRandomnessStats"), oracle.toBuffer()],
    programId,
  )[0];
}

function getLutPda(lutSigner: PublicKey, lutSlot: number | BN): PublicKey {
  return AddressLookupTableProgram.createLookupTable({
    authority: lutSigner,
    payer: PublicKey.default,
    recentSlot: BigInt(lutSlot.toString()),
  })[1];
}

async function fetchRandomnessReveal(
  params:
    | {
        randomnessAccount: PublicKey;
        slothash: string;
        slot: number;
        rpc?: string;
      }
    | {
        randomnessId: string;
        timestamp: number;
        minStalenessSeconds: number;
      },
  gatewayUrl: string,
): Promise<RandomnessRevealResponse> {
  const url = `${gatewayUrl}/gateway/api/v1/randomness_reveal`;
  const method = "POST";
  const headers = { "Content-Type": "application/json" };

  let data: string;
  if ("slot" in params) {
    // Solana Randomness
    data = JSON.stringify({
      slothash: [...bs58.decode(params.slothash)],
      randomness_key: params.randomnessAccount.toBuffer().toString("hex"),
      slot: params.slot,
      rpc: params.rpc,
    });
  } else {
    // Cross-chain randomness
    data = JSON.stringify({
      timestamp: params.timestamp,
      min_staleness_seconds: params.minStalenessSeconds,
      randomness_key: params.randomnessId,
    });
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: data,
    });
    const text = await res.text();
    console.log(text);
    return JSON.parse(text);
  } catch (err) {
    console.error("fetchRandomnessReveal error", err);
    throw err;
  }
}

async function getRandomnessInitIx(
  program: Program<SbOnDemand>,
  randomness: PublicKey,
  queue: PublicKey,
  payer: PublicKey,
): Promise<TransactionInstruction> {
  const lutSigner = getLutSignerPda(program.programId, randomness);
  const recentSlot = new BN(
    (await program.provider.connection.getSlot("finalized")) - 1,
  );
  const lut = getLutPda(lutSigner, recentSlot);

  return await program.methods
    .randomnessInit({
      recentSlot,
    })
    .accountsPartial({
      randomness,
      queue,
      authority: payer,
      payer,
      rewardEscrow: getAssociatedTokenAddressSync(SOL_NATIVE_MINT, randomness),
      systemProgram: SystemProgram.programId,
      tokenProgram: SPL_TOKEN_PROGRAM_ID,
      associatedTokenProgram: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
      wrappedSolMint: SOL_NATIVE_MINT,
      // @ts-ignore
      programState: State.keyFromSeed(program),
      lutSigner,
      lut,
      addressLookupTableProgram: AddressLookupTableProgram.programId,
    })
    .instruction();
}

async function getRandomnessCommitIx(
  program: Program<SbOnDemand>,
  randomness: PublicKey,
  queue: PublicKey,
  authority: PublicKey,
): Promise<TransactionInstruction> {
  // @ts-ignore
  const queueAccount = new Queue(program, queue);

  return program.methods
    .randomnessCommit({})
    .accountsPartial({
      randomness,
      queue,
      oracle: await queueAccount.fetchFreshOracle(),
      recentSlothashes: SPL_SYSVAR_SLOT_HASHES_ID,
      authority,
    })
    .instruction();
}

export async function getRandomnessRevealIx(
  program: Program<SbOnDemand>,
  randomness: Randomness,
  timestamp: number,
  payer: PublicKey,
): Promise<TransactionInstruction> {
  const randomnessData = await randomness.loadData();

  // @ts-ignore
  const oracle = new Oracle(program, randomnessData.oracle);
  const oracleData = await oracle.loadData();

  const gatewayUrl = String.fromCharCode(...oracleData.gatewayUri).replace(
    /\0+$/,
    "",
  );
  console.log("Gateway URL: ", gatewayUrl);
  console.log("Randomness: ", randomness.pubkey.toBase58());
  console.log("Timestamp: ", timestamp);

  // @ts-ignore
  const gateway = new Gateway(program, gatewayUrl);
  const {
    signature,
    recovery_id: recoveryId,
    value,
  } = await fetchRandomnessReveal(
    {
      // randomnessAccount: randomness.pubkey,
      // slothash: bs58.encode(randomnessData.seedSlothash),
      // slot: randomnessData.seedSlot.toNumber(),
      // rpc: clusterApiUrl("devnet"),
      randomnessId: randomness.pubkey.toBase58(),
      timestamp,
      minStalenessSeconds: 30,
    },
    gateway.gatewayUrl,
  );
  console.log("signature:", signature);
  console.log("recoveryId:", recoveryId);
  console.log("value:", value);
  const stats = getOracleRandomessStatsPda(
    program.programId,
    randomnessData.oracle,
  );

  return program.methods
    .randomnessReveal({
      signature: Array.from(Buffer.from(signature, "base64")),
      recoveryId,
      value,
    })
    .accountsPartial({
      randomness: randomness.pubkey,
      oracle: randomnessData.oracle,
      queue: randomnessData.queue,
      stats,
      authority: randomnessData.authority,
      payer,
      recentSlothashes: SPL_SYSVAR_SLOT_HASHES_ID,
      systemProgram: SystemProgram.programId,
      rewardEscrow: getAssociatedTokenAddressSync(
        SOL_NATIVE_MINT,
        randomness.pubkey,
      ),
      tokenProgram: SPL_TOKEN_PROGRAM_ID,
      // associatedTokenProgram: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
      wrappedSolMint: SOL_NATIVE_MINT,
      // @ts-ignore
      programState: State.keyFromSeed(program),
    })
    .instruction();
}

export async function createAndCommitIxs(
  program: Program<SbOnDemand>,
  queue: PublicKey,
  payer: PublicKey,
) {
  const rngKp = Keypair.generate();
  const initIx = await getRandomnessInitIx(
    program,
    rngKp.publicKey,
    queue,
    payer,
  );
  const commitIx = await getRandomnessCommitIx(
    program,
    rngKp.publicKey,
    queue,
    payer,
  );

  return {
    rngKp,
    ixs: [initIx, commitIx],
  };
}
