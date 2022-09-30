import { Common } from '@ethereumjs/common'
import { FeeMarketEIP1559Transaction } from '@ethereumjs/tx'
import { privateToAddress } from '@ethereumjs/util'
import { Client } from 'jayson/promise'
import * as tape from 'tape'

const pkey = Buffer.from('ae557af4ceefda559c924516cabf029bedc36b68109bf8d6183fe96e04121f4e', 'hex')
const sender = '0x' + privateToAddress(pkey).toString('hex')
const shandongJson = require('./configs/geth-genesis.json')
const common = Common.fromGethGenesis(shandongJson, { chain: 'shandong' })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Only run this test when the devnet setup is running
tape('EIP 3540 tx', async (t) => {
  const client = Client.http({ port: 8545 })
  let syncing = true
  while (syncing) {
    const res = await client.request('eth_syncing', [])
    if (res.result === false) {
      syncing = false
    } else {
      await sleep(12000)
    }
  }

  const nonce = await client.request('eth_getTransactionCount', [sender, 'latest'])

  const data = '0x6B' + 'EF0001' + '01000102000100' + '00' + 'AA' + '600052600C6014F3'
  const tx = FeeMarketEIP1559Transaction.fromTxData(
    {
      data,
      gasLimit: 1000000,
      maxFeePerGas: 7656250000,
      nonce: BigInt(nonce.result),
    },
    { common }
  ).sign(pkey)

  const res = await client.request(
    'eth_sendRawTransaction',
    ['0x' + tx.serialize().toString('hex')],
    2.0
  )

  let mined = false
  let receipt
  while (!mined) {
    receipt = await client.request('eth_getTransactionReceipt', [res.result])
    if (receipt.result !== null) {
      mined = true
    } else {
      await sleep(12000)
    }
  }

  const code = await client.request('eth_getCode', [receipt.result.contractAddress, 'latest'])

  t.equal(code.result, '0XEF00010100010200010000AA'.toLowerCase(), 'deposited valid EOF1 code')
  t.end()
})
