import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/lottery.json";
import { BN } from "@coral-xyz/anchor";

const LOTTERY_PROGRAM_ID = new PublicKey(idl.address);

export function getLotteryPdaAndBump(collectionMintPda: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lottery"), collectionMintPda.toBuffer()],
    LOTTERY_PROGRAM_ID,
  );
}

export function getCollectionMintPdaAndBump(authority: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("collection_mint"), authority.toBuffer()],
    LOTTERY_PROGRAM_ID,
  );
}

export function getTicketMintPda(lotteryPda: PublicKey, index: BN) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("ticket_mint"),
      lotteryPda.toBuffer(),
      index.toArrayLike(Buffer, "le", 8),
    ],
    LOTTERY_PROGRAM_ID,
  )[0];
}
