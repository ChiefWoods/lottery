import { Idl, Program } from "@coral-xyz/anchor";
import { AddedAccount, startAnchor } from "solana-bankrun";
import { Lottery } from "../target/types/lottery";
import idl from "../target/idl/lottery.json";
import { MPL_TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  ON_DEMAND_MAINNET_PID,
  ON_DEMAND_MAINNET_GUARDIAN_QUEUE,
  ON_DEMAND_MAINNET_QUEUE,
  Queue,
} from "@switchboard-xyz/on-demand";
import { SbOnDemand } from "./fixtures/sb_on_demand";
import sbIdl from "./fixtures/sb_on_demand.json";
import queueData from "./fixtures/queue.json";
import guardianQueueData from "./fixtures/guardian_queue.json";
import { BankrunContextWrapper } from "./bankrunContextWrapper";

export async function getBankrunSetup(accounts: AddedAccount[] = []) {
  const context = await startAnchor(
    "",
    [
      {
        name: "mpl_token_metadata",
        programId: new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID),
      },
      {
        name: "sb_on_demand",
        programId: ON_DEMAND_MAINNET_PID,
      },
    ],
    [
      ...accounts,
      {
        address: ON_DEMAND_MAINNET_QUEUE,
        info: {
          data: Buffer.from(queueData.account.data[0], "base64"),
          executable: false,
          lamports: LAMPORTS_PER_SOL,
          owner: ON_DEMAND_MAINNET_PID,
        },
      },
      {
        address: ON_DEMAND_MAINNET_GUARDIAN_QUEUE,
        info: {
          data: Buffer.from(guardianQueueData.account.data[0], "base64"),
          executable: false,
          lamports: LAMPORTS_PER_SOL,
          owner: ON_DEMAND_MAINNET_PID,
        },
      },
    ],
    400000n,
  );

  const wrappedContext = new BankrunContextWrapper(context);
  const provider = wrappedContext.provider;
  const program = new Program(idl as Lottery, provider);
  const sbProgram = new Program(sbIdl as SbOnDemand, provider);
  const queue = new Queue(
    sbProgram as unknown as Program<Idl>,
    ON_DEMAND_MAINNET_QUEUE,
  );

  await queue.loadData();

  return {
    context: wrappedContext.context,
    provider,
    program,
    sbProgram,
    queue,
  };
}
