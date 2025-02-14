import { PublicKey } from "@solana/web3.js";
import { Lottery } from "../target/types/lottery";
import { Program } from "@coral-xyz/anchor";

export async function getLotteryAcc(
  program: Program<Lottery>,
  lotteryPda: PublicKey
) {
  return await program.account.lottery.fetchNullable(lotteryPda);
}
