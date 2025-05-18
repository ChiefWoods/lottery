import { Keypair } from "@solana/web3.js";

export const FUNDED_KEYPAIR = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(process.env.ANCHOR_WALLET)),
);
export const BASE_FEE = 5000;
