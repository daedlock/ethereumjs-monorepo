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

async function runTx(client: Client, data: string, to?: string, value?: bigint) {
  const nonce = BigInt((await client.request('eth_getTransactionCount', [sender, 'latest'])).result)

  const block = await client.request('eth_getBlockByNumber', ['latest', false])
  const baseFeePerGas = BigInt(block.result.baseFeePerGas)
  const tx = FeeMarketEIP1559Transaction.fromTxData(
    {
      data,
      gasLimit: 1000000,
      maxFeePerGas: baseFeePerGas * 100n,
      nonce,
      to,
      value,
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
  return receipt.result
}

tape('Shandong EIP tests', async (t) => {
  const client = Client.http({ port: 8545 })

  try {
    const res = await client.request('web3_clientVersion', [])
    if ((res.result as string).includes('EthereumJS')) {
      t.pass('connected to client')
    } else {
      t.fail('connected to wrong client')
    }
  } catch (err) {
    throw new Error('Network is not running')
  }

  let syncing = true
  while (syncing) {
    const res = await client.request('eth_syncing', [])
    if (res.result === false) {
      syncing = false
    } else {
      await sleep(12000)
    }
  }

  // ------------Sanity checks--------------------------------
  t.test('Simple transfer - sanity check', async (st) => {
    await runTx(client, '', '0x3dA33B9A0894b908DdBb00d96399e506515A1009', 1000000n)
    let balance = await client.request('eth_getBalance', [
      '0x3dA33B9A0894b908DdBb00d96399e506515A1009',
      'latest',
    ])
    st.equal(BigInt(balance.result), 1000000n, 'sent a simple ETH transfer')
    await runTx(client, '', '0x3dA33B9A0894b908DdBb00d96399e506515A1009', 1000000n)
    balance = await client.request('eth_getBalance', [
      '0x3dA33B9A0894b908DdBb00d96399e506515A1009',
      'latest',
    ])
    st.equal(BigInt(balance.result), 2000000n, 'sent a simple ETH transfer 2x')
    st.end()
  })

  // ------------EIP 3670 tests-------------------------------
  t.test(' EIP 3670 tests', async (st) => {
    const data = '0x67EF0001010001006060005260086018F3'
    const res = await runTx(client, data)
    st.ok(res.contractAddress !== undefined, 'created contract')
    const code = await client.request('eth_getCode', [res.contractAddress, 'latest'])
    st.equal(code.result, '0x', 'no code was deposited for invalid EOF code')
    st.end()
  })
  // ------------EIP 3540 tests-------------------------------
  t.test('EIP 3540 tests', async (st) => {
    const data = '0x6B' + 'EF0001' + '01000102000100' + '00' + 'AA' + '600052600C6014F3'

    const res = await runTx(client, data)

    const code = await client.request('eth_getCode', [res.contractAddress, 'latest'])

    st.equal(code.result, '0XEF00010100010200010000AA'.toLowerCase(), 'deposited valid EOF1 code')
    st.end()
  })
  // ------------EIP 3860 tests-------------------------------
  t.test('EIP 3860 tests', async (st) => {
    const data =
      '0x7F6000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060005260206000F'
    const res = await runTx(client, data)
    const code = await client.request('eth_getCode', [res.contractAddress, 'latest'])

    st.equal(code.result, '0x', 'no code deposited with invalid init code')
    st.end()
  })
  // ------------EIP 3855 tests-------------------------------
  t.test('EIP 3860 tests', async (st) => {
    const data = '0x5F5F5F'
    const _res = await runTx(client, data)
    st.end()
  })
  // ------------EIP 3651 tests-------------------------------
  t.test('EIP 3651 tests', async (st) => {
    st.end()
  })
  t.end()
})
