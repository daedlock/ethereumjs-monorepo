### Shandong sim setup

This sim test is to setup a single ethereumjs<>lodestar instance to allow executing testvectors for the EIPs targetting Shanghai hardfork.

### Prerequisite(s)

- Docker since lodestar docker image is used to run CL to drive the post-merge sim run
- Docker should run without `sudo`, else prefix `sudo` in from of docker commands in `test/sim/single-run.sh`

### How to run

1. `npm install` the `ethereumjs-monorepo`
2. `cd packages/client`
3. `docker pull chainsafe/lodestar:latest`
4. Create a data directory `/data/shandong` (or any other place convinient for you).

Currently you can just start the local instance by
` DATADIR=/data/shandong GENESIS_HASH=0x51c7fe41be669f69c45c33a56982cbde405313342d9e2b00d7c91a7b284dd4f8 test/sim/./single-run.sh `

This has a genesis hash hardcoded (which will be removed in next commit). This command run should start both ethereumjs and lodestar in terminal. Soon you should see lodestar driving ethereumjs in PoS configuration.

Ethereumjs rpc endpoint should be available at `http://127.0.0.1:8545` for you to test transactions.

TODOs: -[ ] Remove GENESIS_HASH specification requirement [@gajinder] -[ ] Extract total difficulty from the genesis to pass to lodestar instead of hardcoding [@gajinder] -[ ] Enable executing the run from the sim [@gajinder] -[ ] Enable running the sim test in CI [@gajinder] -[ ] Modify gensis to activate the EIPs [@jochem-brouwer] -[ ] Add transaction test cases to test the EIP scenarios as follows: [@jochem-brouwer/@acolytec3 ??]
