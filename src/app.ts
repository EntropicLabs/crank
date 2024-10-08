import { accountFromAny } from "@cosmjs/stargate";
import { Contract } from "./config.js";
import { querier } from "./query.js";
import { ORCHESTRATOR } from "./wallet.js";
import { createGrant, getGrant } from "./workers/index.js";
import * as hub from "./workers/hub.js";
import * as unifier from "./workers/unifier.js";

const ENABLED = [...unifier.contracts, ...hub.contracts,];

const run = async () => {
  await Promise.all(
    ENABLED.map(
      async (c: { address: string; contract: Contract }, idx: number) => {
        switch (c.contract) {
          case Contract.HUB:
            return hub.run(c.address, idx + 1);
          case Contract.UNIFIER:
            return unifier.run(c.address, idx + 1);
        }
      }
    )
  );
};

(async function () {
  const orchestrator = await ORCHESTRATOR;

  try {
    const any = await querier.auth.account(orchestrator[1]);
    const account = any && accountFromAny(any);
    console.info(`[STARTUP] Orchestrator: ${account?.address}`);
  } catch (error: any) {
    console.error(`Account ${orchestrator[1]} does not exist. Send funds.`);
    process.exit();
  }

  const grants = await Promise.all(ENABLED.map((x, idx) => getGrant(idx + 1)));

  await grants.reduce(async (agg, grant, idx: number) => {
    if (grant) return agg;
    await agg;
    return createGrant(idx + 1);
  }, Promise.resolve());

  try {
    await run();
  } catch (error: any) {
    console.error(error);
  } finally {
    await run();
  }
})();
