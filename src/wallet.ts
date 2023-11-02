import { StdFee } from "@cosmjs/amino";
import { Secp256k1, Slip10RawIndex } from "@cosmjs/crypto";

import { Uint53 } from "@cosmjs/math";
import {
  coins,
  DirectSecp256k1HdWallet,
  EncodeObject,
} from "@cosmjs/proto-signing";
import { DeliverTxResponse, SigningStargateClient } from "@cosmjs/stargate";
import { registry } from "kujira.js";
import { GAS_PRICE, PREFIX, RPC_ENDPOINT } from "./config.js";

export const wallet = (account: number) => {
  if (!process.env.MNEMONIC) throw new Error("MNEMONIC not set");

  return DirectSecp256k1HdWallet.fromMnemonic(process.env.MNEMONIC, {
    prefix: PREFIX,
    hdPaths: [
      [
        Slip10RawIndex.hardened(44),
        Slip10RawIndex.hardened(118),
        Slip10RawIndex.hardened(0),
        Slip10RawIndex.normal(0),
        Slip10RawIndex.normal(account),
      ],
    ],
  });
};

export type Client = [SigningStargateClient, string];

export const client = async (account: number): Promise<Client> => {
  const signer = await wallet(account);

  const [acc] = await signer.getAccounts();
  const c = await SigningStargateClient.connectWithSigner(
    RPC_ENDPOINT,
    signer,
    { registry, gasPrice: GAS_PRICE }
  );

  return [c, acc.address];
};

export const ORCHESTRATOR = client(0);

export function calculateFee(gasLimit: number, granter: string): StdFee {
  const { denom, amount: gasPriceAmount } = GAS_PRICE;
  // Note: Amount can exceed the safe integer range (https://github.com/cosmos/cosmjs/issues/1134),
  // which we handle by converting from Decimal to string without going through number.
  const amount = gasPriceAmount
    .multiply(new Uint53(gasLimit))
    .ceil()
    .toString();
  return {
    amount: coins(amount, denom),
    gas: gasLimit.toString(),
    granter,
  };
}

export async function signAndBroadcast(
  account: Client,
  messages: readonly EncodeObject[],
  memo = ""
): Promise<DeliverTxResponse> {
  const gasEstimation = await account[0].simulate(account[1], messages, memo);
  const multiplier = 1.5;
  const orchestrator = await ORCHESTRATOR;
  const fee = calculateFee(
    Math.round(gasEstimation * multiplier),
    orchestrator[1]
  );

  return account[0].signAndBroadcast(account[1], messages, fee, memo);
}

/// Uses the ORACLE_KEY to sign arbitrary data
export async function oracleSignArbitrary(
  data: Uint8Array
): Promise<{ signature: Uint8Array, pubkey: Uint8Array }> {
  if (!process.env.ORACLE_KEY) throw new Error("ORACLE_KEY not set");
  // convert ORACLE_KEY to Uint8Array private key
  const privateKey = new Uint8Array(
    Buffer.from(process.env.ORACLE_KEY, "hex")
  );
  const { pubkey } = await Secp256k1.makeKeypair(privateKey);
  const compressedPubkey = await Secp256k1.compressPubkey(pubkey);
  const extendedSignature = (await Secp256k1.createSignature(data, privateKey));
  const signature = new Uint8Array([
      ...extendedSignature.r(32),
      ...extendedSignature.s(32)
  ]);
  return { signature, pubkey: compressedPubkey };
}