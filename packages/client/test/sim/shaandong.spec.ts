import { FeeMarketEIP1559Transaction } from '@ethereumjs/tx'
import { Client } from 'jayson/promise'
import * as tape from 'tape'
const pkey = Buffer.from('ae557af4ceefda559c924516cabf029bedc36b68109bf8d6183fe96e04121f4e', 'hex')

// Only run this test when the devnet setup is running
tape('EIP 3540 tx', async (t) => {
  const data = '0x6B' + 'EF0001' + '01000102000100' + '00' + 'AA' + '600052600C6014F3'
  const tx = FeeMarketEIP1559Transaction.fromTxData({
    data,
    gasLimit: 1000000,
    maxFeePerGas: 7,
    nonce: 0n,
  }).sign(pkey)

  const client = Client.http({ port: 8545 })
  const res = await client.request(
    'eth_sendRawTransaction',
    ['0x' + tx.serialize().toString('hex')],
    2.0
  )
  console.log(res)
  t.end()
})
