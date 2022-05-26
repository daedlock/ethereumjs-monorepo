import { debug as createDebugLogger } from 'debug'
import { Address, MAX_UINT64, bufferToBigInt } from 'ethereumjs-util'
import Common from '@ethereumjs/common'

import { VmState } from './vmState'
import { VmError, ERROR } from '../exceptions'
import Message from '../evm/message'
import { EVMResult } from '../evm/evm'
import { ExternalInterface, Log } from '../evm/types'
import { addressToBuffer } from '../evm/opcodes'

const debugGas = createDebugLogger('vm:eei:gas')

function trap(err: ERROR) {
  throw new VmError(err)
}

interface Block {
  header: {
    hash(): Buffer
  }
}

interface Blockchain {
  getBlock(number: Number): Promise<Block>
}

/**
 * External interface made available to EVM bytecode. Modeled after
 * the ewasm EEI [spec](https://github.com/ewasm/design/blob/master/eth_interface.md).
 * It includes methods for accessing/modifying state, calling or creating contracts, access
 * to environment data among other things.
 * The EEI instance also keeps artifacts produced by the bytecode such as logs
 * and to-be-selfdestructed addresses.
 */
export default class EEI implements ExternalInterface {
  _state: VmState
  _common: Common
  _blockchain: Blockchain

  constructor(state: VmState, common: Common, blockchain: Blockchain) {
    this._state = state
    this._common = common
    this._blockchain = blockchain
  }

  /**
   * Subtracts an amount from the gas counter.
   * @param amount - Amount of gas to consume
   * @param context - Usage context for debugging
   * @throws if out of gas
   */
  useGas(amount: bigint, context?: string): void {
    this._gasLeft -= amount
    if (this._evm.DEBUG) {
      debugGas(`${context ? context + ': ' : ''}used ${amount} gas (-> ${this._gasLeft})`)
    }
    if (this._gasLeft < BigInt(0)) {
      this._gasLeft = BigInt(0)
      trap(ERROR.OUT_OF_GAS)
    }
  }

  /**
   * Adds a positive amount to the gas counter.
   * @param amount - Amount of gas refunded
   * @param context - Usage context for debugging
   */
  refundGas(amount: bigint, context?: string): void {
    if (this._evm.DEBUG) {
      debugGas(`${context ? context + ': ' : ''}refund ${amount} gas (-> ${this._evm._refund})`)
    }
    this._evm._refund += amount
  }

  /**
   * Reduces amount of gas to be refunded by a positive value.
   * @param amount - Amount to subtract from gas refunds
   * @param context - Usage context for debugging
   */
  subRefund(amount: bigint, context?: string): void {
    if (this._evm.DEBUG) {
      debugGas(`${context ? context + ': ' : ''}sub gas refund ${amount} (-> ${this._evm._refund})`)
    }
    this._evm._refund -= amount
    if (this._evm._refund < BigInt(0)) {
      this._evm._refund = BigInt(0)
      trap(ERROR.REFUND_EXHAUSTED)
    }
  }

  /**
   * Increments the internal gasLeft counter. Used for adding callStipend.
   * @param amount - Amount to add
   */
  addStipend(amount: bigint): void {
    if (this._evm.DEBUG) {
      debugGas(`add stipend ${amount} (-> ${this._gasLeft})`)
    }
    this._gasLeft += amount
  }

  /**
   * Returns balance of the given account.
   * @param address - Address of account
   */
  async getExternalBalance(address: Address): Promise<bigint> {
    // shortcut if current account
    if (address.equals(this._env.address)) {
      return this._env.contract.balance
    }

    // otherwise load account then return balance
    const account = await this._state.getAccount(address)
    return account.balance
  }

  /**
   * Get size of an account’s code.
   * @param address - Address of account
   */
  async getExternalCodeSize(address: bigint): Promise<bigint> {
    const addr = new Address(addressToBuffer(address))
    const code = await this._state.getContractCode(addr)
    return BigInt(code.length)
  }

  /**
   * Returns code of an account.
   * @param address - Address of account
   */
  async getExternalCode(address: bigint): Promise<Buffer> {
    const addr = new Address(addressToBuffer(address))
    return this._state.getContractCode(addr)
  }

  /**
   * Returns Gets the hash of one of the 256 most recent complete blocks.
   * @param num - Number of block
   */
  async getBlockHash(num: bigint): Promise<bigint> {
    const block = await this._env.blockchain.getBlock(Number(num))
    return bufferToBigInt(block.hash())
  }

  /**
   * Store 256-bit a value in memory to persistent storage.
   */
  async storageStore(key: Buffer, value: Buffer): Promise<void> {
    await this._state.putContractStorage(this._env.address, key, value)
    const account = await this._state.getAccount(this._env.address)
    this._env.contract = account
  }

  /**
   * Loads a 256-bit value to memory from persistent storage.
   * @param key - Storage key
   * @param original - If true, return the original storage value (default: false)
   */
  async storageLoad(key: Buffer, original = false): Promise<Buffer> {
    if (original) {
      return this._state.getOriginalContractStorage(this._env.address, key)
    } else {
      return this._state.getContractStorage(this._env.address, key)
    }
  }

  /**
   * Mark account for later deletion and give the remaining balance to the
   * specified beneficiary address. This will cause a trap and the
   * execution will be aborted immediately.
   * @param toAddress - Beneficiary address
   */
  async selfDestruct(toAddress: Address): Promise<void> {
    return this._selfDestruct(toAddress)
  }

  async _selfDestruct(toAddress: Address): Promise<void> {
    // only add to refund if this is the first selfdestruct for the address
    if (!this._result.selfdestruct[this._env.address.buf.toString('hex')]) {
      this.refundGas(this._common.param('gasPrices', 'selfdestructRefund'))
    }

    this._result.selfdestruct[this._env.address.buf.toString('hex')] = toAddress.buf

    // Add to beneficiary balance
    const toAccount = await this._state.getAccount(toAddress)
    toAccount.balance += this._env.contract.balance
    await this._state.putAccount(toAddress, toAccount)

    // Subtract from contract balance
    await this._state.modifyAccountFields(this._env.address, {
      balance: BigInt(0),
    })

    trap(ERROR.STOP)
  }

  /**
   * Creates a new log in the current environment.
   */
  log(data: Buffer, numberOfTopics: number, topics: Buffer[]): void {
    if (numberOfTopics < 0 || numberOfTopics > 4) {
      trap(ERROR.OUT_OF_RANGE)
    }

    if (topics.length !== numberOfTopics) {
      trap(ERROR.INTERNAL_ERROR)
    }

    const log: Log = [this._env.address.buf, topics, data]
    this._result.logs.push(log)
  }

  /**
   * Sends a message with arbitrary data to a given address path.
   */
  async call(gasLimit: bigint, address: Address, value: bigint, data: Buffer): Promise<bigint> {
    const msg = new Message({
      caller: this._env.address,
      gasLimit,
      to: address,
      value,
      data,
      isStatic: this._env.isStatic,
      depth: this._env.depth + 1,
    })

    return this._baseCall(msg)
  }

  /**
   * Sends a message with arbitrary data to a given address path.
   */
  async authcall(gasLimit: bigint, address: Address, value: bigint, data: Buffer): Promise<bigint> {
    const msg = new Message({
      caller: this._env.auth,
      gasLimit,
      to: address,
      value,
      data,
      isStatic: this._env.isStatic,
      depth: this._env.depth + 1,
      authcallOrigin: this._env.address,
    })

    return this._baseCall(msg)
  }

  /**
   * Message-call into this account with an alternative account's code.
   */
  async callCode(gasLimit: bigint, address: Address, value: bigint, data: Buffer): Promise<bigint> {
    const msg = new Message({
      caller: this._env.address,
      gasLimit,
      to: this._env.address,
      codeAddress: address,
      value,
      data,
      isStatic: this._env.isStatic,
      depth: this._env.depth + 1,
    })

    return this._baseCall(msg)
  }

  /**
   * Sends a message with arbitrary data to a given address path, but disallow
   * state modifications. This includes log, create, selfdestruct and call with
   * a non-zero value.
   */
  async callStatic(
    gasLimit: bigint,
    address: Address,
    value: bigint,
    data: Buffer
  ): Promise<bigint> {
    const msg = new Message({
      caller: this._env.address,
      gasLimit,
      to: address,
      value,
      data,
      isStatic: true,
      depth: this._env.depth + 1,
    })

    return this._baseCall(msg)
  }

  /**
   * Message-call into this account with an alternative account’s code, but
   * persisting the current values for sender and value.
   */
  async callDelegate(
    gasLimit: bigint,
    address: Address,
    value: bigint,
    data: Buffer
  ): Promise<bigint> {
    const msg = new Message({
      caller: this._env.caller,
      gasLimit,
      to: this._env.address,
      codeAddress: address,
      value,
      data,
      isStatic: this._env.isStatic,
      delegatecall: true,
      depth: this._env.depth + 1,
    })

    return this._baseCall(msg)
  }

  async _baseCall(msg: Message): Promise<bigint> {
    const selfdestruct = { ...this._result.selfdestruct }
    msg.selfdestruct = selfdestruct

    // empty the return data buffer
    this._lastReturned = Buffer.alloc(0)

    // Check if account has enough ether and max depth not exceeded
    if (
      this._env.depth >= Number(this._common.param('vm', 'stackLimit')) ||
      (msg.delegatecall !== true && this._env.contract.balance < msg.value)
    ) {
      return BigInt(0)
    }

    const results = await this._evm.runCall({ message: msg })

    if (results.execResult.logs) {
      this._result.logs = this._result.logs.concat(results.execResult.logs)
    }

    // this should always be safe
    this.useGas(results.execResult.gasUsed, 'CALL, STATICCALL, DELEGATECALL, CALLCODE')

    // Set return value
    if (
      results.execResult.returnValue &&
      (!results.execResult.exceptionError ||
        results.execResult.exceptionError.error === ERROR.REVERT)
    ) {
      this._lastReturned = results.execResult.returnValue
    }

    if (!results.execResult.exceptionError) {
      Object.assign(this._result.selfdestruct, selfdestruct)
      // update stateRoot on current contract
      const account = await this._state.getAccount(this._env.address)
      this._env.contract = account
    }

    return this._getReturnCode(results)
  }

  /**
   * Creates a new contract with a given value.
   */
  async create(gasLimit: bigint, value: bigint, data: Buffer, salt?: Buffer): Promise<bigint> {
    const selfdestruct = { ...this._result.selfdestruct }
    const caller = this._env.address
    const depth = this._env.depth + 1

    // empty the return data buffer
    this._lastReturned = Buffer.alloc(0)

    // Check if account has enough ether and max depth not exceeded
    if (
      this._env.depth >= Number(this._common.param('vm', 'stackLimit')) ||
      this._env.contract.balance < value
    ) {
      return BigInt(0)
    }

    // EIP-2681 check
    if (this._env.contract.nonce >= MAX_UINT64) {
      return BigInt(0)
    }

    this._env.contract.nonce += BigInt(1)
    await this._state.putAccount(this._env.address, this._env.contract)

    if (this._common.isActivatedEIP(3860)) {
      if (data.length > Number(this._common.param('vm', 'maxInitCodeSize'))) {
        return BigInt(0)
      }
    }

    const message = new Message({
      caller,
      gasLimit,
      value,
      data,
      salt,
      depth,
      selfdestruct,
    })

    const results = await this._evm.runCall({ message })

    if (results.execResult.logs) {
      this._result.logs = this._result.logs.concat(results.execResult.logs)
    }

    // this should always be safe
    this.useGas(results.execResult.gasUsed, 'CREATE')

    // Set return buffer in case revert happened
    if (
      results.execResult.exceptionError &&
      results.execResult.exceptionError.error === ERROR.REVERT
    ) {
      this._lastReturned = results.execResult.returnValue
    }

    if (
      !results.execResult.exceptionError ||
      results.execResult.exceptionError.error === ERROR.CODESTORE_OUT_OF_GAS
    ) {
      Object.assign(this._result.selfdestruct, selfdestruct)
      // update stateRoot on current contract
      const account = await this._state.getAccount(this._env.address)
      this._env.contract = account
      if (results.createdAddress) {
        // push the created address to the stack
        return bufferToBigInt(results.createdAddress.buf)
      }
    }

    return this._getReturnCode(results)
  }

  /**
   * Creates a new contract with a given value. Generates
   * a deterministic address via CREATE2 rules.
   */
  async create2(gasLimit: bigint, value: bigint, data: Buffer, salt: Buffer): Promise<bigint> {
    return this.create(gasLimit, value, data, salt)
  }

  /**
   * Returns true if account is empty or non-existent (according to EIP-161).
   * @param address - Address of account
   */
  async isAccountEmpty(address: Address): Promise<boolean> {
    return this._state.accountIsEmpty(address)
  }

  /**
   * Returns true if account exists in the state trie (it can be empty). Returns false if the account is `null`.
   * @param address - Address of account
   */
  async accountExists(address: Address): Promise<boolean> {
    return this._state.accountExists(address)
  }

  private _getReturnCode(results: EVMResult) {
    // This preserves the previous logic, but seems to contradict the EEI spec
    // https://github.com/ewasm/design/blob/38eeded28765f3e193e12881ea72a6ab807a3371/eth_interface.md
    if (results.execResult.exceptionError) {
      return BigInt(0)
    } else {
      return BigInt(1)
    }
  }
}
