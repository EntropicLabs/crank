import { Contract, NETWORK } from "config.js";
import { client, signAndBroadcast } from "wallet.js";
import { msg } from "kujira.js";

export const registry = {
    "kaiyo-1": [],
    "harpoon-4": [
        { address: "kujira1jhmfj3avt2dlswrqlgx7fssvgrqfqzyj9m5cvgavuwekquxhu27ql88enu" },
        { address: "kujira16t7wlfluk27c7emzvxfcqxzged7tkne9p7rrwexzc7gdg6dvk4psxm5waf" }
    ]
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
                        crank: {},
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
        await new Promise((resolve) => setTimeout(resolve, 600000));
        await run(address, idx);
    }
}
