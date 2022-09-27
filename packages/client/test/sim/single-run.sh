#!/bin/bash
# set -e

currentDir=$(pwd)
scriptDir=$(dirname $0)
scriptDir="$currentDir/$scriptDir"

if [ ! -n "$DATADIR" ] || (touch $DATADIR/shaandong.txt) && [ ! -n "$(ls -A $DATADIR)" ]
then
  echo "provide a valid DATADIR with configs folder, currently DATADIR=$DATADIR, exiting ... "
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
    kill -9 $ejsPid
  fi;
  if [ -n "$lodePid" ]
  then
    docker rm beacon -f
  fi;

  ejsPid=""
  lodePid=""
}

ejsCmd="npm run client:start -- --datadir $DATADIR/ethereumjs --gethGenesis $scriptDir/configs/geth-genesis.json --rpcEngine --rpcEngineAuth false"
run_cmd "$ejsCmd"
ejsPid=$!

if [ ! -n "$GENESIS_HASH" ]
then
  # We should curl and get genesis hash, but for now lets assume it will be provided
  echo "Currently need the GENESIS_HASH to be provided"
  cleanup
  exit
fi


genTime="$(date +%s)"
genTime=$((genTime + 30))
echo "genTime=${genTime}"


lodeCmd="docker run --rm --name beacon --network host chainsafe/lodestar:next dev --dataDir $DATADIR/lodestar --genesisValidators 8 --startValidators 0..7 --enr.ip 127.0.0.1 --genesisEth1Hash $GENESIS_HASH --params.ALTAIR_FORK_EPOCH 0 --params.BELLATRIX_FORK_EPOCH 0 --params.TERMINAL_TOTAL_DIFFICULTY 0x01 --genesisTime $genTime"
run_cmd "$lodeCmd"
lodePid=$!


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


