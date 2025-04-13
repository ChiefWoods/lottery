import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { AddedAccount, ProgramTestContext, startAnchor } from "solana-bankrun";
import { Lottery } from "../target/types/lottery";
import idl from "../target/idl/lottery.json";
import { MPL_TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import {
  clusterApiUrl,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  AnchorUtils,
  ON_DEMAND_DEVNET_PID,
  ON_DEMAND_DEVNET_QUEUE,
  Queue,
} from "@switchboard-xyz/on-demand";
import { SbOnDemand } from "./fixtures/sb_on_demand";
import sbIdl from "./fixtures/sb_on_demand.json";
import stateData from "./fixtures/state.json";
import { BankrunContextWrapper } from "./bankrunContextWrapper";

const devnetConnection = new Connection(clusterApiUrl("devnet"));

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
        programId: ON_DEMAND_DEVNET_PID,
      },
    ],
    [
      ...accounts,
      {
        address: new PublicKey(stateData.pubkey),
        info: {
          data: Buffer.from(stateData.account.data[0], "base64"),
          executable: false,
          lamports: LAMPORTS_PER_SOL,
          owner: ON_DEMAND_DEVNET_PID,
        },
      },
    ],
    400000n,
  );

  const oracleKeys = await fetchOracleKeysFromCluster();
  await setAccsFromCluster(context, [ON_DEMAND_DEVNET_QUEUE, ...oracleKeys]);

  const wrappedContext = new BankrunContextWrapper(context);
  const provider = wrappedContext.provider;
  const program = new Program<Lottery>(idl as Lottery, provider);
  // loadProgramFromProvider not used here because it cannot accept a BankrunProvider
  const sbProgram = new Program(sbIdl as SbOnDemand, provider);
  const queue = new Queue(
    // @ts-ignore
    sbProgram,
    ON_DEMAND_DEVNET_QUEUE,
  );

  return {
    context: wrappedContext.context,
    provider,
    program,
    sbProgram: sbProgram as unknown as Program<SbOnDemand>,
    queue,
  };
}

async function setAccsFromCluster(
  context: ProgramTestContext,
  pubkeys: PublicKey[],
) {
  const accInfos = await devnetConnection.getMultipleAccountsInfo(pubkeys);

  accInfos.forEach(({ data, executable, owner, lamports }, i) => {
    context.setAccount(pubkeys[i], {
      data,
      executable,
      owner,
      lamports,
    });
  });
}

async function fetchOracleKeysFromCluster(): Promise<PublicKey[]> {
  const provider = new AnchorProvider(devnetConnection, {} as Wallet);
  const sbProgram = (await AnchorUtils.loadProgramFromProvider(
    provider,
  )) as unknown as Program<SbOnDemand>;
  const queueAcc = await sbProgram.account.queueAccountData.fetch(
    ON_DEMAND_DEVNET_QUEUE,
  );
  return queueAcc.oracleKeys.filter(
    (key) => !key.equals(SystemProgram.programId),
  );
}
