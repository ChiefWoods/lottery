import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { Lottery } from "../target/types/lottery";
import idl from "../target/idl/lottery.json";
import {
  clusterApiUrl,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { SbOnDemand } from "./fixtures/sb_on_demand";
import onDemandIdl from "./fixtures/sb_on_demand.json";
import { FUNDED_KEYPAIR } from "./constants";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const provider = new AnchorProvider(connection, new Wallet(FUNDED_KEYPAIR));
const program = new Program<Lottery>(idl, provider);
const onDemandProgram = new Program<SbOnDemand>(onDemandIdl, provider);
const umi = createUmi(connection.rpcEndpoint, "confirmed").use(
  mplTokenMetadata(),
);

export function getSetup() {
  return { program, onDemandProgram, umi };
}

export async function fundKeypair(
  pubkey: PublicKey,
  lamports: number = LAMPORTS_PER_SOL / 10,
) {
  const ix = SystemProgram.transfer({
    fromPubkey: FUNDED_KEYPAIR.publicKey,
    toPubkey: pubkey,
    lamports,
  });
  const tx = new Transaction().add(ix);
  tx.feePayer = FUNDED_KEYPAIR.publicKey;
  const signature = await connection.sendTransaction(tx, [FUNDED_KEYPAIR]);
  await connection.confirmTransaction(signature);
}
