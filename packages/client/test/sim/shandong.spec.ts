import { Common } from '@ethereumjs/common'
import { privateToAddress } from '@ethereumjs/util'
import { Client } from 'jayson/promise'
import * as tape from 'tape'

import { runTxHelper, sleep, startNetwork } from './simutils'

const pkey = Buffer.from('ae557af4ceefda559c924516cabf029bedc36b68109bf8d6183fe96e04121f4e', 'hex')
const sender = '0x' + privateToAddress(pkey).toString('hex')
const shandongJson = require('./configs/geth-genesis.json')
const common = Common.fromGethGenesis(shandongJson, { chain: 'shandong' })
const client = Client.http({ port: 8545 })

export async function runTx(data: string, to?: string, value?: bigint) {
  return runTxHelper({ client, common, sender, pkey }, data, to, value)
}

const filterKeywords = ['warn', 'error', 'npm run client:start', 'docker run']
const filterOutWords = ['duties', 'Low peer count', 'MaxListenersExceededWarning']

tape('Shandong EIP tests', async (t) => {
  const { teardownCallBack, result } = await startNetwork(client, {
    filterKeywords,
    filterOutWords,
    externalRun: process.env.EXTERNAL_RUN,
  })

  tape.onFinish(teardownCallBack)
  if (result.includes('EthereumJS')) {
    t.pass('connected to client')
  } else {
    t.fail('connected to wrong client')
  }

  let syncing = true
  let tries = 0
  while (syncing && tries < 5) {
    tries++
    const res = await client.request('eth_syncing', [])
    if (res.result === false) {
      syncing = false
    } else {
      process.stdout.write('*')
      await sleep(12000)
    }
  }
  if (syncing) {
    t.fail('ethereumjs<>lodestar failed to start')
  } else {
    t.pass('ethereumjs<>lodestar synced')
  }

  // ------------Sanity checks--------------------------------
  t.test('Simple transfer - sanity check', async (st) => {
    await runTx('', '0x3dA33B9A0894b908DdBb00d96399e506515A1009', 1000000n)
    let balance = await client.request('eth_getBalance', [
      '0x3dA33B9A0894b908DdBb00d96399e506515A1009',
      'latest',
    ])
    st.equal(BigInt(balance.result), 1000000n, 'sent a simple ETH transfer')
    await runTx('', '0x3dA33B9A0894b908DdBb00d96399e506515A1009', 1000000n)
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
    const res = await runTx(data)
    st.ok(res.contractAddress !== undefined, 'created contract')
    const code = await client.request('eth_getCode', [res.contractAddress, 'latest'])
    st.equal(code.result, '0x', 'no code was deposited for invalid EOF code')
    st.end()
  })
  // ------------EIP 3540 tests-------------------------------
  t.test('EIP 3540 tests', async (st) => {
    const data = '0x6B' + 'EF0001' + '01000102000100' + '00' + 'AA' + '600052600C6014F3'

    const res = await runTx(data)

    const code = await client.request('eth_getCode', [res.contractAddress, 'latest'])

    st.equal(code.result, '0XEF00010100010200010000AA'.toLowerCase(), 'deposited valid EOF1 code')
    st.end()
  })
  // ------------EIP 3860 tests-------------------------------
  t.test('EIP 3860 tests', async (st) => {
    const data =
      '0x7F6000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000060005260206000F'
    const res = await runTx(data)
    const code = await client.request('eth_getCode', [res.contractAddress, 'latest'])

    st.equal(code.result, '0x', 'no code deposited with invalid init code')
    st.end()
  })
  // ------------EIP 3855 tests-------------------------------
  t.test('EIP 3860 tests', async (st) => {
    const data = '0x5F5F5F'
    const _res = await runTx(data)
    st.end()
  })
  // ------------EIP 3651 tests-------------------------------
  t.test('EIP 3651 tests', async (st) => {
    st.end()
  })
  t.end()
})
