import { BigNumber, Contract } from 'ethers';
import { Interface } from 'ethers/lib/utils';

import { BigNumberish } from '@balancer-labs/v2-helpers/src/numbers';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';

export const CHAINED_REFERENCE_TEMP_PREFIX = 'ba10'; // Temporary reference: it is deleted after a read.
export const CHAINED_REFERENCE_READONLY_PREFIX = 'ba11'; // Read-only reference: it is not deleted after a read.

export function toChainedReference(key: BigNumberish, isTemporary = true): BigNumber {
  const prefix = isTemporary ? CHAINED_REFERENCE_TEMP_PREFIX : CHAINED_REFERENCE_READONLY_PREFIX;
  // The full padded prefix is 66 characters long, with 64 hex characters and the 0x prefix.
  const paddedPrefix = `0x${prefix}${'0'.repeat(64 - prefix.length)}`;

  return BigNumber.from(paddedPrefix).add(key);
}

const mockBatchRelayerLibraryInterface = new Interface([
  'function setChainedReferenceValue(uint256 ref, uint256 value) public returns (uint256)',
  'function getChainedReferenceValue(uint256 ref) public',
  'event ChainedReferenceValueRead(uint256 value)',
]);

export async function setChainedReferenceContents(
  relayer: Contract,
  ref: BigNumberish,
  value: BigNumberish
): Promise<void> {
  await relayer.multicall([
    mockBatchRelayerLibraryInterface.encodeFunctionData('setChainedReferenceValue', [ref, value]),
  ]);
}

export async function expectChainedReferenceContents(
  relayer: Contract,
  ref: BigNumberish,
  expectedValue: BigNumberish
): Promise<void> {
  const receipt = await (
    await relayer.multicall([mockBatchRelayerLibraryInterface.encodeFunctionData('getChainedReferenceValue', [ref])])
  ).wait();

  expectEvent.inIndirectReceipt(receipt, mockBatchRelayerLibraryInterface, 'ChainedReferenceValueRead', {
    value: BigNumber.from(expectedValue),
  });
}
