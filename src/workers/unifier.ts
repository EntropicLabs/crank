import { Contract, NETWORK } from "config.js";
import { Client, client, oracleSignArbitrary, signAndBroadcast } from "wallet.js";
import { msg } from "kujira.js";
import { querier } from "query.js";
import { sha256 } from "@cosmjs/crypto";

type Config = {
    address: string;
    target: string;
}
type Coin = {
    denom: string;
    amount: string;
}

export const registry: { [k: string]: Config[] } = {
    "kaiyo-1": [],
    "harpoon-4": [
        {
            address: "kujira1rfkn3h4ph8ud28qwa2papetys727p9ndcfxyjv79szs4u5t22akqxl8u8x",
            target: "factory/kujira1643jxg8wasy5cfcn7xm8rd742yeazcksqlg4d7/umnta",
        },
        {
            address: "kujira1j30vkmwea4ktsc7wq3as95x5dqsa34a3skv6jujfeje5nlxj5maqsw4gs0",
            target: "ukuji",
        }
    ]
};

export const contracts = [
    ...registry[NETWORK].map(({ address }) => ({
        address,
        contract: Contract.UNIFIER,
    })),
];

async function queryMantaSwap(input: string, amount: string, output: string, slippage: string = "0.01"): Promise<[{ address: string, denom: string }[], Coin]> {
    const inputCoin = { denom: input, amount };
    const body = {
        input: {
            denom: input,
            amount,
            slippage,
        },
        output: {
            denom: output
        }
    };
    const res = await fetch(`https://api.mantadao.app/${NETWORK}/route`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    }).then((res) => res.json());
    if (res.error) {
        // Don't spam the console with "denom not found" errors
        return [[], inputCoin];
    }
    const stages: [[string, string]][] = res.routes[0].tx.swap.stages;
    const route = stages.map(([[address, denom]]) => ({
        address,
        denom
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
async function constructMultiInputSwap(balances: Coin[], config: Config): Promise<[[string, string][][], Coin[]]> {
    // Query all one-to-one swap paths
    const results = await Promise.all(balances.map(async ({ denom, amount }) => {
        console.debug(`[UNIFIER:${config.address}] Querying MantaSwap API for ${amount} ${denom} -> ${config.target}`);
        return await queryMantaSwap(denom, amount, config.target).catch((e: any) => {
            console.error(`[UNIFIER:${config.address}] ${e}`);
            return [];
        });
    }));

    type Node = {
        address: string;
        denom: string;
        maxStage: number;
        next?: Node;
    }

    // Construct graph to find multi-input single-output swap paths
    let graph: { [k: string]: Node } = {};
    let inputCoins: { denom: string, amount: string }[] = [];
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
            stages[stage].push([node.address, node.denom]);
            if (node.next) {
                next.push(node.next);
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
        // Fetch balances to be used as inputs
        const { balances }: { balances: Coin[] } =
            await querier.wasm.queryContractSmart(config.address, { pending_swaps: {} });
        const [stages, funds] = await constructMultiInputSwap(balances, config);

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
                }
            }
        }

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
        await new Promise((resolve) => setTimeout(resolve, 600000));
        await run(address, idx);
    }
}
