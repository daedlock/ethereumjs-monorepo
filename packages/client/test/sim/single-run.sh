#!/bin/bash
# set -e

currentDir=$(pwd)
scriptDir=$(dirname $0)
scriptDir="$currentDir/$scriptDir"

if [ ! -n "$DATADIR" ]
then
  DATADIR="$scriptDir/data"
  mkdir $DATADIR
fi;

if [ ! -n "$DATADIR" ] || (touch $DATADIR/shandong.txt) && [ ! -n "$(ls -A $DATADIR)" ]
then
  echo "provide a valid DATADIR, currently DATADIR=$DATADIR, exiting ... "
  exit;
fi;

# these two commands will harmlessly fail if folders exists
mkdir $DATADIR/ethereumjs
mkdir $DATADIR/lodestar

# clean these folders as old data can cause issues
rm -rf $DATADIR/ethereumjs
rm -rf $DATADIR/lodestar

run_cmd(){
  execCmd=$1;
  if [ -n "$DETACHED" ]
  then
    echo "running detached: $execCmd"
    eval "$execCmd"
  else
    if [ -n "$WITH_TERMINAL" ]
    then
      execCmd="$WITH_TERMINAL $execCmd"
    fi;
    echo "running: $execCmd &"
    eval "$execCmd" &
  fi;
}

cleanup() {
  echo "cleaning up"
  if [ -n "$ejsPid" ] 
  then
    echo "cleaning ethereumjs pid:${ejsPid}..."
    pidBySearch=$(ps | grep "$DATADIR/ethereumjs" | grep -v grep | awk '{print $1}')
    echo "pidBySearch: $pidBySearch"
    kill $pidBySearch
  fi;
  if [ -n "$lodePid" ]
  then
    echo "cleaning lodestar pid:${lodePid}..."
    docker rm beacon -f
  fi;

  ejsPid=""
  lodePid=""
}

ejsCmd="npm run client:start -- --datadir $DATADIR/ethereumjs --gethGenesis $scriptDir/configs/geth-genesis.json --rpc --rpcEngine --rpcEngineAuth false"
run_cmd "$ejsCmd"
ejsPid=$!
echo "ejsPid: $ejsPid"

ejsId=0
if [ ! -n "$GENESIS_HASH" ]
then
  # We should curl and get genesis hash, but for now lets assume it will be provided
  while [ ! -n "$GENESIS_HASH" ]
  do
    sleep 3
    echo "Fetching genesis hash from ethereumjs ..."
    ejsId=$(( ejsId +1 ))
    responseCmd="curl --location --request POST 'http://localhost:8545' --header 'Content-Type: application/json' --data-raw '{
      \"jsonrpc\": \"2.0\",
      \"method\": \"eth_getBlockByNumber\",
      \"params\": [
          \"0x0\",
          true
      ],
      \"id\": $ejsId
    }' 2>/dev/null | jq \".result.hash\""
    # echo "$responseCmd"
    GENESIS_HASH=$(eval "$responseCmd")
  done;
fi
echo "genesisHash=${GENESIS_HASH}"

genTime="$(date +%s)"
genTime=$((genTime + 15))
echo "genTime=${genTime}"


lodeCmd="docker run --rm --name beacon -v $DATADIR:/data --network host chainsafe/lodestar:latest dev --dataDir /data/lodestar --genesisValidators 8 --startValidators 0..7 --enr.ip 127.0.0.1 --genesisEth1Hash $GENESIS_HASH --params.ALTAIR_FORK_EPOCH 0 --params.BELLATRIX_FORK_EPOCH 0 --params.TERMINAL_TOTAL_DIFFICULTY 0x01 --genesisTime $genTime"
run_cmd "$lodeCmd"
lodePid=$!
echo "lodePid: $lodePid"

trap "echo exit signal recived;cleanup" SIGINT SIGTERM

if [ ! -n "$DETACHED" ] && [ -n "$ejsPid" ] && [ -n "$lodePid" ]
then
    echo "launched ejsPid=$ejsPid lodePid=$lodePid"
    echo "use ctl + c on any of these (including this) terminals to stop the process"
    wait -n $ejsPid $lodePid
fi

# if its not detached and is here, it means one of the processes exited/didn't launch
if [ ! -n "$DETACHED" ] && [ -n "$ejsPid$lodePid" ]
then
  echo "cleaning up ejsPid=$ejsPid lodePid=$lodePid "
  cleanup
fi;

echo "Script run finished, exiting ..."


