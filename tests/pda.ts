import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/lottery.json";
import { BN } from "@coral-xyz/anchor";

export function getLotteryPdaAndBump(collectionMintPda: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lottery"), collectionMintPda.toBuffer()],
    new PublicKey(idl.address)
  );
}

export function getCollectionMintPdaAndBump() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("collection_mint")],
    new PublicKey(idl.address)
  );
}

export function getTicketMintPda(index: BN) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ticket_mint"), index.toArrayLike(Buffer, "le", 8)],
    new PublicKey(idl.address)
  )[0];
}
