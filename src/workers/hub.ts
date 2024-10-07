import { Contract, NETWORK } from "config.js";
import { client, signAndBroadcast } from "wallet.js";
import { msg } from "kujira.js";
import { HUBS } from "@entropic-labs/quark.js";

export const registry = {
  "kaiyo-1": Object.values(HUBS["kaiyo-1"]).map((x) => ({
    address: x!.address,
    interval: 86400,
  })),
  "harpoon-4": Object.keys(HUBS["harpoon-4"]).map((address) => ({
    address,
    interval: 60,
  })),
};

export const contracts = [
  ...registry[NETWORK].map(({ address }) => ({
    address,
    contract: Contract.HUB,
  })),
];

/// We need to run the "{ crank: {} }" message on the hub to:
/// 1. Claim and redistribute rewards
/// 2. Vote on proposals
/// 3. Queue unbondings, etc.
export async function run(address: string, idx: number) {
  const config = registry[NETWORK].find((x) => x.address === address);
  if (!config) throw new Error(`${address} hub not found`);

  try {
    const w = await client(idx);

    const msgs = [
      msg.wasm.msgExecuteContract({
        sender: w[1],
        contract: address,
        msg: Buffer.from(
          JSON.stringify({
            crank: "empty",
          })
        ),
        funds: [],
      }),
    ];
    try {
      console.debug(`[HUB:${address}] Cranking...`);
      const res = await signAndBroadcast(w, msgs, "auto");
      console.info(`[HUB:${address}] Cranked: ${res.transactionHash}`);
    } catch (e: any) {
      console.error(`[HUB:${address}] ${e}`);
    }
  } catch (error: any) {
    console.error(`[HUB:${address}] ${error.message}`);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, config.interval * 1000));
    await run(address, idx);
  }
}
