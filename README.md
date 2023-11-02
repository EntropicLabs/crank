# Quark Crank

This repository is forked from the (Kujira Crank repository)[https://github.com/Team-Kujira/crank]. It has the following modifications:
* Use `bun` instead of `yarn`
* Crank workers for Quark contracts
* Remove `appsignal`

This crank app uses a single "orchestrator" account, and sets up feegrants to allow concurrent cranking of the BOW Contracts and USK Liqudiations.

Long-term this will be replaced by the on-chain scheduler. Until then, this app allows us to understand the dynamics of these crankers before committing to the scheduler.

## Setup

1. Ensure that you have `MNEMONIC` available on your env for the orchestrator account, and the `ORACLE_KEY`, a Secp256k1 key for the oracle signer.
1. `bun install`
1. `NETWORK=mainnet bun run src/app.ts`

NB: On first start, all the feegrants will be created which can take some time
