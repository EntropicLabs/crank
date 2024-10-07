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

export const wallet = (account: number, prefix = PREFIX) => {
  if (!process.env.MNEMONIC) throw new Error("MNEMONIC not set");

  return DirectSecp256k1HdWallet.fromMnemonic(process.env.MNEMONIC, {
    prefix,
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

export const client = async (
  account: number,
  rpc = RPC_ENDPOINT,
  gasPrice = GAS_PRICE,
  prefix?: string
): Promise<Client> => {
  const signer = await wallet(account, prefix);

  const [acc] = await signer.getAccounts();
  const c = await SigningStargateClient.connectWithSigner(rpc, signer, {
    registry,
    gasPrice,
  });

  return [c, acc.address];
};

export const ORCHESTRATOR = client(0);

export function calculateFee(gasLimit: number, granter?: string): StdFee {
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
  memo = "",
  granter?: string | null
): Promise<DeliverTxResponse> {
  const gasEstimation = await account[0].simulate(account[1], messages, memo);
  const multiplier = 2.0;
  if (granter === null) {
    granter = undefined;
  } else {
    granter = granter || (await ORCHESTRATOR)[1];
  }
  const fee = calculateFee(Math.round(gasEstimation * multiplier), granter);

  return account[0].signAndBroadcast(account[1], messages, fee, memo);
}

/// Uses the ORACLE_KEY to sign arbitrary data
export async function oracleSignArbitrary(
  data: Uint8Array
): Promise<{ signature: Uint8Array; pubkey: Uint8Array }> {
  if (!process.env.ORACLE_KEY) throw new Error("ORACLE_KEY not set");
  // convert ORACLE_KEY to Uint8Array private key
  const privateKey = new Uint8Array(Buffer.from(process.env.ORACLE_KEY, "hex"));
  const { pubkey } = await Secp256k1.makeKeypair(privateKey);
  const compressedPubkey = await Secp256k1.compressPubkey(pubkey);
  const extendedSignature = await Secp256k1.createSignature(data, privateKey);
  const signature = new Uint8Array([
    ...extendedSignature.r(32),
    ...extendedSignature.s(32),
  ]);
  return { signature, pubkey: compressedPubkey };
}
