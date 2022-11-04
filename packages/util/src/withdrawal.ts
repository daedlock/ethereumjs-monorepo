import { Address } from './address'
import { TypeOutput, toType } from './types'

import type { AddressLike, BigIntLike } from './types'

export type WithdrawalData = {
  index: BigIntLike
  validatorIndex: BigIntLike
  address: AddressLike
  amount: BigIntLike
}

export class Withdrawal {
  constructor(
    public readonly index: bigint,
    public readonly validatorIndex: bigint,
    public readonly address: Address,
    public readonly amount: bigint
  ) {}

  public static fromWithdrawalData(withdrawalData: WithdrawalData) {
    const {
      index: indexData,
      validatorIndex: validatorIndexData,
      address: addressData,
      amount: amountData,
    } = withdrawalData
    const index = toType(indexData, TypeOutput.BigInt)
    const validatorIndex = toType(validatorIndexData, TypeOutput.BigInt)
    const address = new Address(toType(addressData, TypeOutput.Buffer))
    const amount = toType(amountData, TypeOutput.BigInt)

    return new Withdrawal(index, validatorIndex, address, amount)
  }

  /**
   * Convert a withdrawal to a buffer array
   * @param withdrawal the withdrawal to convert
   * @returns buffer array of the withdrawal
   */
  public static toBufferArray(
    withdrawal: Withdrawal | WithdrawalData
  ): [Buffer, Buffer, Buffer, Buffer] {
    const { index, validatorIndex, address, amount } = withdrawal
    const indexBuffer = toType(index, TypeOutput.Buffer)
    const validatorIndexBuffer = toType(validatorIndex, TypeOutput.Buffer)
    let addressBuffer
    if (address instanceof Address) {
      addressBuffer = (<Address>address).buf
    } else {
      addressBuffer = toType(address, TypeOutput.Buffer)
    }
    const amountBuffer = toType(amount, TypeOutput.Buffer)

    return [indexBuffer, validatorIndexBuffer, addressBuffer, amountBuffer]
  }

  raw() {
    return Withdrawal.toBufferArray(this)
  }
}
