import { Contract, NETWORK } from "config.js";
import {
  Client,
  client,
  oracleSignArbitrary,
  signAndBroadcast,
} from "wallet.js";
import { Denom, MAINNET, msg } from "kujira.js";
import { querier } from "query.js";
import { sha256 } from "@cosmjs/crypto";
import { UNIFIERS } from "@entropic-labs/quark.js";

type Config = {
  address: string;
  target: string;
};
type Coin = {
  denom: string;
  amount: string;
};

export const registry: { [k: string]: Config[] } = {
  "kaiyo-1": Object.values(UNIFIERS["kaiyo-1"]).map((config) => ({
    address: config!.address,
    target: config!.target_denom,
  })),
  "harpoon-4": Object.values(UNIFIERS["harpoon-4"]).map((config) => ({
    address: config!.address,
    target: config!.target_denom,
  })),
};

export const contracts = [
  ...registry[NETWORK].map(({ address }) => ({
    address,
    contract: Contract.UNIFIER,
  })),
];

const mantaSwapURL = () =>
  NETWORK === MAINNET
    ? "https://api.mantaswap.app"
    : `https://api.mantaswap.app/${NETWORK}`;

const hardcodedRoutes: {
  [denom: string]: {
    address: string;
    output: string;
    maxSwapAmount: string;
    for?: string;
  };
} = {
  "factory/kujira166ysf07ze5suazfzj0r05tv8amk2yn8zvsfuu7/uplnk": {
    address:
      "kujira1phpdpsnrkfvqr5883p8jlqslknuc7ypfd78er5ajkfpd3cuy7hqs93a4n7",
    output:
      "factory/kujira1qk00h5atutpsv900x202pxx42npjr9thg58dnqpa72f2p7m2luase444a7/uusk",
    maxSwapAmount: "1000000000", //1000 PLNK
  },
  "factory/kujira17clmjjh9jqvnzpt0s90qx4zag8p5m2p6fq3mj9727msdf5gyx87qanzf3m/ulp":
    {
      address:
        "kujira1vunhdfym5au07lfdq9ljayect0k6w6krl3ykz0q4pukz3xuj4m5s62wv5h",
      output:
        "factory/kujira1qk00h5atutpsv900x202pxx42npjr9thg58dnqpa72f2p7m2luase444a7/uusk",
      maxSwapAmount: "10000000000", //10,000 LP FUZN-USK
    },
  "factory/kujira1w4yaama77v53fp0f9343t9w2f932z526vj970n2jv5055a7gt92sxgwypf/urcpt":
    {
      address:
        "kujira1vunhdfym5au07lfdq9ljayect0k6w6krl3ykz0q4pukz3xuj4m5s62wv5h",
      output:
        "factory/kujira1qk00h5atutpsv900x202pxx42npjr9thg58dnqpa72f2p7m2luase444a7/uusk",
      maxSwapAmount: "10000000000", //10,000 xUSK
    },
  "factory/kujira1jelmu9tdmr6hqg0d6qw4g6c9mwrexrzuryh50fwcavcpthp5m0uq20853h/urcpt":
    {
      address:
        "kujira1vunhdfym5au07lfdq9ljayect0k6w6krl3ykz0q4pukz3xuj4m5s62wv5h",
      output:
        "ibc/FE98AAD68F02F03565E9FA39A5E627946699B2B07115889ED812D8BA639576A9",
      maxSwapAmount: "10000000000", //10,000 xUSDC
    },
  "factory/kujira143fwcudwy0exd6zd3xyvqt2kae68ud6n8jqchufu7wdg5sryd4lqtlvvep/urcpt":
    {
      address:
        "kujira1vunhdfym5au07lfdq9ljayect0k6w6krl3ykz0q4pukz3xuj4m5s62wv5h",
      output: "ukuji",
      maxSwapAmount: "10000000000", //10,000 xKUJI
    },
  "factory/kujira13x2l25mpkhwnwcwdzzd34cr8fyht9jlj7xu9g4uffe36g3fmln8qkvm3qn/unami":
    {
      address:
        "kujira19m0dg0ggvpv8js3gt0jx04r6rx7ru9x2ra5v0mwhmc8zlk6vngxsj9r4qd",
      output:
        "ibc/FE98AAD68F02F03565E9FA39A5E627946699B2B07115889ED812D8BA639576A9",
      maxSwapAmount: "10000000000", //10,000 NAMI
    },
  "ibc/FE98AAD68F02F03565E9FA39A5E627946699B2B07115889ED812D8BA639576A9": {
    for: "kujira1v4pe9h3yf54fj5g67fd52gcv365272ntqpwuyew5j37kdvr3kxass8pckn", // ONLY FOR AQLA
    address:
      "kujira1nswv58h3acql85587rkusqx3zn7k9qx3a3je8wqd3xnw39erpwnsddsm8z",
    output: "factory/kujira1xe0awk5planmtsmjel5xtx2hzhqdw5p8z66yqd/uaqla",
    maxSwapAmount: "100000000", // 100 USDC -> AQLA
  },
};

// Tokens that we shouldn't swap
const blacklist: string[] = [];

const MIN_OVERRIDES: { [denom: string]: bigint } = {
  "ibc/31ED168F5E93D988FCF223B1298113ACA818DB7BED8F7B73764C5C9FAC293609":
    100000000000n, // 100 ROAR
  "ibc/6A4CEDCEA40B587A4BCF7FDFB1D5A13D13F8A807A22A4E759EA702640CE086B0":
    100000000000000n, // 0.0001 DYDX
};

const MIN_SWAP_AMOUNT = (denom: string): bigint => {
  if (MIN_OVERRIDES[denom]) {
    return MIN_OVERRIDES[denom];
  }
  let d = Denom.from(denom);
  if (d.decimals === 18) {
    return 100000000000000n; // 0.0001 of an 18 decimal token
  } else {
    return 10000n; // 0.01 of a 6 decimal token
  }
};

async function queryMantaSwapWhitelist(): Promise<string[]> {
  const res = await fetch(`${mantaSwapURL()}/whitelist`).then((res) =>
    res.json()
  );
  if (res.error) {
    console.error(`[UNIFIER:whitelist] Error fetching whitelist: ${res.error}`);
    return [];
  }
  return res.map((x: any) => x.denom);
}

async function queryMantaSwap(
  input: string,
  amount: string,
  output: string,
  slippage: string = "0.01"
): Promise<[{ address: string; denom: string }[], Coin]> {
  const inputCoin = { denom: input, amount };
  const body = {
    input: {
      denom: input,
      amount,
      slippage,
    },
    output: {
      denom: output,
    },
  };
  const res = await fetch(`${mantaSwapURL()}/route`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then((res) => res.json());
  if (res.error) {
    // Don't spam the console with "denom not found" errors
    console.error(`[UNIFIER:${input}] ${res.error}`);
    return [[], inputCoin];
  }
  if (res.routes.length === 0) {
    return [[], inputCoin];
  }
  const stages: [[string, string]][] = res.routes[0].tx.swap.stages;
  const route = stages.map(([[address, denom]]) => ({
    address,
    denom,
  }));

  return [route.reverse(), inputCoin];
}

/**
 * Constructs a multi-input single-output swap path.
 *
 * Queries MantaSwap API for the best single-input single-output swap path.
 * Combines them using a graph:
 * - Multiple sources, single sink
 * - Each "chain" (run of degree 1) is a single-input single-output swap path
 * - Many inputs will converge at various points in the graph
 */
async function constructMultiInputSwap(
  balances: Coin[],
  config: Config
): Promise<[[string, string][][], Coin[]]> {
  // Query all one-to-one swap paths
  const results = await Promise.all(
    balances.map(async ({ denom, amount }) => {
      if (BigInt(amount) < MIN_SWAP_AMOUNT(denom)) {
        console.debug(
          `[UNIFIER:${config.address}] Skipping ${denom} due to small balance`
        );
        return [[], { denom, amount }] as [
          { address: string; denom: string }[],
          Coin
        ];
      }
      if (blacklist.includes(denom)) {
        console.debug(
          `[UNIFIER:${config.address}] Skipping ${denom} due to blacklist`
        );
        return [[], { denom, amount }] as [
          { address: string; denom: string }[],
          Coin
        ];
      }
      console.debug(
        `[UNIFIER:${config.address}] Querying MantaSwap API for ${amount} ${denom} -> ${config.target}`
      );
      if (
        hardcodedRoutes[denom] &&
        (!hardcodedRoutes[denom].for ||
          hardcodedRoutes[denom].for === config.address)
      ) {
        const { address, output, maxSwapAmount } = hardcodedRoutes[denom];
        // Rough parseInt since precision here doesn't matter
        if (parseInt(amount) > parseInt(maxSwapAmount)) {
          amount = maxSwapAmount;
        }
        console.debug(
          `[UNIFIER:${config.address}] Using hardcoded route for ${denom} -> ${output}`
        );

        return [[{ address, denom }], { denom, amount }] as [
          { address: string; denom: string }[],
          Coin
        ];
      }
      return await queryMantaSwap(denom, amount, config.target).catch(
        (e: any) => {
          console.error(`[UNIFIER:${config.address}] (${denom}) query: ${e}`);
          return [[], { denom, amount }] as [
            { address: string; denom: string }[],
            Coin
          ];
        }
      );
    })
  );

  type Node = {
    address: string;
    denom: string;
    maxStage: number;
    next?: Node;
  };

  // Construct graph to find multi-input single-output swap paths
  let graph: { [k: string]: Node } = {};
  let inputCoins: { denom: string; amount: string }[] = [];
  let sources: { [k: string]: boolean } = {};
  results.forEach(([route, coin], idx) => {
    if (route.length) inputCoins.push(coin);
    let prev: Node | undefined = undefined;
    for (let stage = 0; stage < route.length; stage++) {
      const { address, denom } = route[stage];
      if (!graph[address]) {
        graph[address] = {
          address,
          denom,
          maxStage: stage,
        };
      } else {
        graph[address].maxStage = Math.max(graph[address].maxStage, stage);
      }

      sources[address] = graph[address].maxStage === 0;

      if (prev) {
        prev.next = graph[address];
      }
      prev = graph[address];
    }
  });

  // Traverse down the graph from each source,
  // pausing until maxStage is reached for inclusion in the current stage
  let cur = Object.values(graph).filter(({ address }) => sources[address]);
  const stages: [string, string][][] = [];
  let stage = 0;
  while (cur.length) {
    stages.push([]);
    const next: Node[] = [];
    cur.forEach((node) => {
      if (node.maxStage > stage) {
        next.push(node);
        return;
      }
      // Filter out duplicate addresses and denoms
      // Yes, this is slow, but who cares
      if (
        !stages[stage].find(
          ([address, denom]) => address === node.address || denom === node.denom
        )
      ) {
        stages[stage].push([node.address, node.denom]);
        if (node.next) {
          next.push(node.next);
        }
      }
    });
    cur = next;
    stage++;
  }

  // The swap contract pops, so reverse the stages
  return [stages.reverse(), inputCoins];
}

export async function run(address: string, idx: number) {
  const config = registry[NETWORK].find((x) => x.address === address);
  if (!config) throw new Error(`${address} unifier not found`);
  try {
    const w = await client(idx);
    const whitelist = await queryMantaSwapWhitelist();
    // Fetch balances to be used as inputs
    const { balances }: { balances: Coin[] } =
      await querier.wasm.queryContractSmart(config.address, {
        pending_swaps: {},
      });
    // Filter out non-whitelisted tokens, small balances, and already-target denom
    let filteredBalances = balances.filter(
      ({ denom }) =>
        whitelist.includes(denom) ||
        !!hardcodedRoutes[denom] ||
        denom === config.target
    );
    const [stages, funds] = await constructMultiInputSwap(
      filteredBalances,
      config
    );

    if (stages.length === 0 || funds.length === 0) {
      console.debug(`[UNIFIER:${address}] No swaps to be made`);
      return;
    }

    const seconds = Math.floor(Date.now() / 1000);
    const toSign = { stages, funds, timestamp: seconds };
    // Recent versions of JavaScript guarantee that JSON.stringify
    // returns a deterministic string, so we can safely hash it.
    const hash = await sha256(Buffer.from(JSON.stringify(toSign)));
    const { signature, pubkey } = await oracleSignArbitrary(hash);

    const tx = {
      crank: {
        stages,
        funds,
        signature: {
          timestamp: seconds,
          pubkey: Buffer.from(pubkey).toString("hex"),
          signature: Buffer.from(signature).toString("hex"),
        },
      },
    };

    console.debug(`[UNIFIER:${address}] Cranking...`);

    const msgs = [
      msg.wasm.msgExecuteContract({
        sender: w[1],
        contract: address,
        msg: Buffer.from(JSON.stringify(tx)),
        funds: [],
      }),
    ];
    try {
      console.debug(`[UNIFIER:${address}] Cranking...`);
      const res = await signAndBroadcast(w, msgs, "auto");
      console.info(`[UNIFIER:${address}] Cranked: ${res.transactionHash}`);
    } catch (e: any) {
      console.error(`[UNIFIER:${address}] ${e}`);
    }
  } catch (error: any) {
    console.error(`[UNIFIER:${address}] ${error.message}`);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 33200000));
    await run(address, idx);
  }
}
