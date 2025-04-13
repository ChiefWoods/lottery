import { BN, Program } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  AddressLookupTableProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  Queue,
  SOL_NATIVE_MINT,
  SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
  SPL_SYSVAR_SLOT_HASHES_ID,
  SPL_TOKEN_PROGRAM_ID,
  State,
} from "@switchboard-xyz/on-demand";
import { SbOnDemand } from "./fixtures/sb_on_demand";

function getLutSignerPda(programId: PublicKey, pubkey: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("LutSigner"), pubkey.toBuffer()],
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
