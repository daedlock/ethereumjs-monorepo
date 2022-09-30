### Shandong sim setup

This sim test is to setup a single ethereumjs<>lodestar instance to allow executing testvectors for the EIPs targetting Shanghai hardfork.

### Prerequisite(s)

- Docker since lodestar docker image is used to run CL to drive the post-merge sim run
- Docker should run without `sudo`, else prefix `sudo` in from of docker commands in `test/sim/single-run.sh`

### How to run

1. `npm install` the `ethereumjs-monorepo`
2. `cd packages/client`
3. `docker pull chainsafe/lodestar:latest`
4. Install linux package `jq` is not installed
5. Create a data directory `data/shandong` (or any other place convinient for you).

#### Auto run using script

(Might only run good on ubuntu/linux)

Currently you can just start the local instance by
`DATADIR=data/shandong test/sim/./single-run.sh`

This command run should start both ethereumjs and lodestar in terminal. Soon you should see lodestar driving ethereumjs in PoS configuration.

##### Process cleanup

The script should auto clean the processes. In case it fails to do so:

1. Remove lodestar by `docker rm -f beacon`
2. Find the ethereumjs process by doing `ps -a | grep client` and do `kill <process id>`

#### Manual run using script

1. Clean DATADIR (`data/shandong`) in start of each run and do `mkdir data/shandong/ethereumjs && mkdir data/shandong/lodestar`
2. Start ethereumjs: `npm run client:start -- --datadir data/shandong/ethereumjs --gethGenesis test/sim/configs/geth-genesis.json --rpc --rpcEngine --rpcEngineAuth false`
3. Get genesis hash from `ethereumjs` client:

```
curl --location --request POST 'http://localhost:8545' --header 'Content-Type: application/json' --data-raw '{
      "jsonrpc": "2.0",
      "method": "eth_getBlockByNumber",
      "params": [
          "0x0",
          true
      ],
      "id": 1
    }' 2>/dev/null | jq ".result.hash"
```

Currently it should give you `0x3feda37f61eaa3d50deaa39cf04e352af0b54c521b0f16d26f826b54edeef756`

4. Get current time stamp: `date +%s` and add `30` to it which gives you current time + `30` seconds for e.g. `1664538222`
5. Start lodestar replacing the timestamp that you got from step 3 in `--genesisTime`: `docker run --rm --name beacon --network host chainsafe/lodestar:latest dev --dataDir data/shandong/lodestar --genesisValidators 8 --startValidators 0..7 --enr.ip 127.0.0.1 --genesisEth1Hash 0x3feda37f61eaa3d50deaa39cf04e352af0b54c521b0f16d26f826b54edeef756 --params.ALTAIR_FORK_EPOCH 0 --params.BELLATRIX_FORK_EPOCH 0 --params.TERMINAL_TOTAL_DIFFICULTY 0x01 --genesisTime 1664538222`

### EIP(s) testing

#### Pre funded accounts

Prefunded dev accounts with keys
0x97C9B168C5E14d5D369B6D88E9776E5B7b11dcC1 - ae557af4ceefda559c924516cabf029bedc36b68109bf8d6183fe96e04121f4e
0x806ce45534bb07a2CAd3a84c53611a2b3DdE316A - 6bf0835d2935042acb92b10331f6c32395b8e049d148d1f8a5567f46f05be573

#### Transaction testing

Ethereumjs rpc endpoint should now be available at `http://127.0.0.1:8545` for you to test transactions.
OR
You may run some transaction scenarios from handcrafted `test/sim/shandong.spec.ts` for testing the `Shanghai` EIPS.
`npm run tape -- test/sim/shandong.spec.ts`

happy Testing the Shanghai!

### TODOs: (cc: @holgerd77 )

2. Extract total difficulty from the genesis to pass to lodestar instead of hardcoding [@g11tech]
3. Enable executing the run from the sim [@g11tech]
4. Enable running the sim test in CI [@g11tech]
5. Modify gensis to activate the EIPs [@jochem-brouwer/@acolytec3]
6. Add transaction test cases to test the EIP scenarios as follows: [@jochem-brouwer/@acolytec3 ??]
