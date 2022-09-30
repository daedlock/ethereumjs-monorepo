### Shandong sim setup

This sim test is to setup a single ethereumjs<>lodestar instance to allow executing testvectors for the EIPs targetting Shanghai hardfork.

### Prerequisite(s)

- Docker since lodestar docker image is used to run CL to drive the post-merge sim run
- Docker should run without `sudo`, else prefix `sudo` in from of docker commands in `test/sim/single-run.sh`

### How to run

1. `npm install` the `ethereumjs-monorepo`
2. `cd packages/client`
3. `docker pull chainsafe/lodestar:latest`
4. Install package `jq` is not installed
5. Create a data directory `data/shandong` (or any other place convinient for you).

Currently you can just start the local instance by
`DATADIR=/data/shandong test/sim/./single-run.sh`

This has a genesis hash hardcoded (which will be removed in next commit). This command run should start both ethereumjs and lodestar in terminal. Soon you should see lodestar driving ethereumjs in PoS configuration.

Ethereumjs rpc endpoint should be available at `http://127.0.0.1:8545` for you to test transactions.

TODOs: (cc: @holgerd77 )

1. Remove GENESIS_HASH specification requirement [@g11tech]
2. Extract total difficulty from the genesis to pass to lodestar instead of hardcoding [@g11tech]
3. Enable executing the run from the sim [@g11tech]
4. Enable running the sim test in CI [@g11tech]
5. Modify gensis to activate the EIPs [@jochem-brouwer/@acolytec3]
6. Add transaction test cases to test the EIP scenarios as follows: [@jochem-brouwer/@acolytec3 ??]

Prefunded dev accounts with keys
0x97C9B168C5E14d5D369B6D88E9776E5B7b11dcC1 - ae557af4ceefda559c924516cabf029bedc36b68109bf8d6183fe96e04121f4e
0x806ce45534bb07a2CAd3a84c53611a2b3DdE316A - 6bf0835d2935042acb92b10331f6c32395b8e049d148d1f8a5567f46f05be573

### EIP(s) testing

You may run some transaction scenarios from handcrafted `test/sim/shandong.spec.ts` for testing the `Shanghai` EIPS.

`npm run tape -- test/sim/shandong.spec.ts`

Or modify them and play away!
happy Testing the Shanghai!
