import { GasPrice } from "@cosmjs/stargate";
import { MAINNET, TESTNET } from "kujira.js";

export const NETWORK = process.env.NETWORK === "mainnet" ? MAINNET : TESTNET;

export enum Contract {
  HUB = "hub",
  UNIFIER = "unifier",
}

const RPCS = {
  [MAINNET]: [
    "https://kujira-rpc.polkachu.com",
    "https://rpc-kujira.starsquid.io",
    "https://rpc-kujira.mintthemoon.xyz",
  ],
  [TESTNET]:
    [
      "https://kujira-testnet-rpc.polkachu.com",
      "https://test-rpc-kujira.mintthemoon.xyz",
      "https://dev-rpc-kujira.mintthemoon.xyz",
    ]
}

const RPC_DEFAULT =
  process.env.NETWORK === "mainnet" ? RPCS[MAINNET][0] : RPCS[TESTNET][0];

export const PREFIX = process.env.PREFIX || "kujira";
export const RPC_ENDPOINT = process.env.RPC_ENDPOINT || RPC_DEFAULT;
export const GAS_PRICE = GasPrice.fromString(
  process.env.GAS_PRICE || "0.0034ukuji"
);