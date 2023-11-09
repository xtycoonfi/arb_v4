import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, Contract, ContractReceipt } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Token from '@balancer-labs/v2-helpers/src/models/tokens/Token';
import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import StablePool from '@balancer-labs/v2-helpers/src/models/pools/stable/StablePool';

import { SwapKind, StablePoolEncoder } from '@balancer-labs/balancer-js';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { expectTransferEvent } from '@balancer-labs/v2-helpers/src/test/expectTransfer';
import { deploy, deployedAt } from '@balancer-labs/v2-helpers/src/contract';
import { actionId } from '@balancer-labs/v2-helpers/src/models/misc/actions';
import { ANY_ADDRESS, MAX_INT256, MAX_UINT256, ZERO_ADDRESS } from '@balancer-labs/v2-helpers/src/constants';
import { BigNumberish, fp } from '@balancer-labs/v2-helpers/src/numbers';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';
import { Account } from '@balancer-labs/v2-helpers/src/models/types/types';
import TypesConverter from '@balancer-labs/v2-helpers/src/models/types/TypesConverter';
import { Dictionary } from 'lodash';
import { expectChainedReferenceContents, toChainedReference } from './helpers/chainedReferences';
import { sharedBeforeEach } from '@balancer-labs/v2-common/sharedBeforeEach';

const amplFP = (n: number) => fp(n / 10 ** 9);

describe('UnbuttonWrapping', function () {
  let ampl: Token, wampl: Token;
  let senderUser: SignerWithAddress, recipientUser: SignerWithAddress, admin: SignerWithAddress;
  let vault: Vault;
  let relayer: Contract, relayerLibrary: Contract;

  before('setup signer', async () => {
    [, admin, senderUser, recipientUser] = await ethers.getSigners();
  });

  sharedBeforeEach('deploy Vault', async () => {
    vault = await Vault.create({ admin });

    const amplContract = await deploy('TestToken', {
      args: ['Mock Ampleforth', 'AMPL', 9],
    });
    ampl = new Token('Mock Ampleforth', 'AMPL', 9, amplContract);

    const wamplContract = await deploy('MockUnbuttonERC20', {
      args: [ampl.address, 'Mock Wrapped Ampleforth', 'wAMPL'],
    });
    wampl = new Token('wampl', 'wampl', 18, wamplContract);

    await ampl.mint(admin, '1000', { from: admin });
    await ampl.instance.connect(admin).approve(wampl.address, '1000');
    await wampl.instance.connect(admin).initialize('1000000');
  });

  sharedBeforeEach('mint tokens to senderUser', async () => {
    await ampl.mint(senderUser, amplFP(100), { from: admin });
    await ampl.approve(vault.address, amplFP(100), { from: senderUser });

    await ampl.mint(senderUser, amplFP(2500), { from: admin });
    await ampl.approve(wampl.address, amplFP(150), { from: senderUser });

    await wampl.instance.connect(senderUser).deposit(amplFP(150));
  });

  sharedBeforeEach('set up relayer', async () => {
    // Deploy Relayer
    relayerLibrary = await deploy('MockBatchRelayerLibrary', {
      args: [vault.address, ZERO_ADDRESS, ZERO_ADDRESS, false],
    });
    relayer = await deployedAt('BalancerRelayer', await relayerLibrary.getEntrypoint());

    // Authorize Relayer for all actions
    const relayerActionIds = await Promise.all(
      ['swap', 'batchSwap', 'joinPool', 'exitPool', 'setRelayerApproval', 'manageUserBalance'].map((action) =>
        actionId(vault.instance, action)
      )
    );
    const authorizer = vault.authorizer;
    await Promise.all(
      relayerActionIds.map((action) => {
        return authorizer.connect(admin).grantPermission(action, relayer.address, ANY_ADDRESS);
      })
    );

    // Approve relayer by sender
    await vault.instance.connect(senderUser).setRelayerApproval(senderUser.address, relayer.address, true);
  });

  function encodeApprove(token: Token, amount: BigNumberish): string {
    return relayerLibrary.interface.encodeFunctionData('approveVault', [token.address, amount]);
  }

  function encodeWrap(
    sender: Account,
    recipient: Account,
    amount: BigNumberish,
    outputReference?: BigNumberish
  ): string {
    return relayerLibrary.interface.encodeFunctionData('wrapUnbuttonToken', [
      wampl.address,
      TypesConverter.toAddress(sender),
      TypesConverter.toAddress(recipient),
      amount,
      outputReference ?? 0,
    ]);
  }

  function encodeUnwrap(
    sender: Account,
    recipient: Account,
    amount: BigNumberish,
    outputReference?: BigNumberish
  ): string {
    return relayerLibrary.interface.encodeFunctionData('unwrapUnbuttonToken', [
      wampl.address,
      TypesConverter.toAddress(sender),
      TypesConverter.toAddress(recipient),
      amount,
      outputReference ?? 0,
    ]);
  }

  async function setChainedReferenceContents(ref: BigNumberish, value: BigNumberish): Promise<void> {
    await relayer.multicall([relayerLibrary.interface.encodeFunctionData('setChainedReferenceValue', [ref, value])]);
  }

  describe('primitives', () => {
    const amount = amplFP(1);

    describe('wrap AMPL', () => {
      let tokenSender: Account, tokenRecipient: Account;

      context('sender = senderUser, recipient = relayer', () => {
        beforeEach(async () => {
          tokenSender = senderUser;
          tokenRecipient = relayer;
        });
        testWrap();
      });

      context('sender = senderUser, recipient = senderUser', () => {
        beforeEach(() => {
          tokenSender = senderUser;
          tokenRecipient = senderUser;
        });
        testWrap();
      });

      context('sender = relayer, recipient = relayer', () => {
        beforeEach(async () => {
          await ampl.transfer(relayer, amount, { from: senderUser });
          tokenSender = relayer;
          tokenRecipient = relayer;
        });
        testWrap();
      });

      context('sender = relayer, recipient = senderUser', () => {
        beforeEach(async () => {
          await ampl.transfer(relayer, amount, { from: senderUser });
          tokenSender = relayer;
          tokenRecipient = senderUser;
        });
        testWrap();
      });

      function testWrap(): void {
        it('wraps with immediate amounts', async () => {
          const expectedWamplAmount = await wampl.instance.underlyingToWrapper(amount);

          const receipt = await (
            await relayer.connect(senderUser).multicall([encodeWrap(tokenSender, tokenRecipient, amount)])
          ).wait();

          const relayerIsSender = TypesConverter.toAddress(tokenSender) === relayer.address;
          expectTransferEvent(
            receipt,
            {
              from: TypesConverter.toAddress(tokenSender),
              to: TypesConverter.toAddress(relayerIsSender ? wampl : relayer),
              value: amount,
            },
            ampl
          );
          const relayerIsRecipient = TypesConverter.toAddress(tokenRecipient) === relayer.address;
          expectTransferEvent(
            receipt,
            {
              from: TypesConverter.toAddress(ZERO_ADDRESS),
              to: TypesConverter.toAddress(relayerIsRecipient ? relayer : tokenRecipient),
              value: expectedWamplAmount,
            },
            wampl
          );
        });

        it('stores wrap output as chained reference', async () => {
          const expectedWamplAmount = await wampl.instance.underlyingToWrapper(amount);

          await relayer
            .connect(senderUser)
            .multicall([encodeWrap(tokenSender, tokenRecipient, amount, toChainedReference(0))]);

          await expectChainedReferenceContents(relayer, toChainedReference(0), expectedWamplAmount);
        });

        it('wraps with chained references', async () => {
          const expectedWamplAmount = await wampl.instance.underlyingToWrapper(amount);
          await setChainedReferenceContents(toChainedReference(0), amount);

          const receipt = await (
            await relayer
              .connect(senderUser)
              .multicall([encodeWrap(tokenSender, tokenRecipient, toChainedReference(0))])
          ).wait();

          const relayerIsSender = TypesConverter.toAddress(tokenSender) === relayer.address;
          expectTransferEvent(
            receipt,
            {
              from: TypesConverter.toAddress(tokenSender),
              to: TypesConverter.toAddress(relayerIsSender ? wampl : relayer),
              value: amount,
            },
            ampl
          );
          const relayerIsRecipient = TypesConverter.toAddress(tokenRecipient) === relayer.address;
          expectTransferEvent(
            receipt,
            {
              from: TypesConverter.toAddress(ZERO_ADDRESS),
              to: TypesConverter.toAddress(relayerIsRecipient ? relayer : tokenRecipient),
              value: expectedWamplAmount,
            },
            wampl
          );
        });
      }
    });

    describe('unwrap WAMPL', () => {
      let tokenSender: Account, tokenRecipient: Account;

      context('sender = senderUser, recipient = relayer', () => {
        beforeEach(async () => {
          await wampl.approve(vault.address, fp(10), { from: senderUser });
          tokenSender = senderUser;
          tokenRecipient = relayer;
        });
        testUnwrap();
      });

      context('sender = senderUser, recipient = senderUser', () => {
        beforeEach(async () => {
          await wampl.approve(vault.address, fp(10), { from: senderUser });
          tokenSender = senderUser;
          tokenRecipient = senderUser;
        });
        testUnwrap();
      });

      context('sender = relayer, recipient = relayer', () => {
        beforeEach(async () => {
          await wampl.transfer(relayer, amount, { from: senderUser });
          tokenSender = relayer;
          tokenRecipient = relayer;
        });
        testUnwrap();
      });

      context('sender = relayer, recipient = senderUser', () => {
        beforeEach(async () => {
          await wampl.transfer(relayer, amount, { from: senderUser });
          tokenSender = relayer;
          tokenRecipient = senderUser;
        });
        testUnwrap();
      });

      function testUnwrap(): void {
        it('unwraps with immediate amounts', async () => {
          const receipt = await (
            await relayer.connect(senderUser).multicall([encodeUnwrap(tokenSender, tokenRecipient, amount)])
          ).wait();

          const relayerIsSender = TypesConverter.toAddress(tokenSender) === relayer.address;
          expectTransferEvent(
            receipt,
            {
              from: TypesConverter.toAddress(tokenSender),
              to: TypesConverter.toAddress(relayerIsSender ? ZERO_ADDRESS : relayer),
              value: amount,
            },
            wampl
          );
          const relayerIsRecipient = TypesConverter.toAddress(tokenRecipient) === relayer.address;
          expectTransferEvent(
            receipt,
            {
              from: TypesConverter.toAddress(wampl),
              to: TypesConverter.toAddress(relayerIsRecipient ? relayer : tokenRecipient),
              value: await wampl.instance.wrapperToUnderlying(amount),
            },
            ampl
          );
        });

        it('stores unwrap output as chained reference', async () => {
          await relayer
            .connect(senderUser)
            .multicall([encodeUnwrap(tokenSender, tokenRecipient, amount, toChainedReference(0))]);

          const amplAmount = await wampl.instance.wrapperToUnderlying(amount);
          await expectChainedReferenceContents(relayer, toChainedReference(0), amplAmount);
        });

        it('unwraps with chained references', async () => {
          await setChainedReferenceContents(toChainedReference(0), amount);

          const receipt = await (
            await relayer
              .connect(senderUser)
              .multicall([encodeUnwrap(tokenSender, tokenRecipient, toChainedReference(0))])
          ).wait();

          const relayerIsSender = TypesConverter.toAddress(tokenSender) === relayer.address;
          expectTransferEvent(
            receipt,
            {
              from: TypesConverter.toAddress(tokenSender),
              to: TypesConverter.toAddress(relayerIsSender ? ZERO_ADDRESS : relayer),
              value: amount,
            },
            wampl
          );
          const relayerIsRecipient = TypesConverter.toAddress(tokenRecipient) === relayer.address;
          expectTransferEvent(
            receipt,
            {
              from: TypesConverter.toAddress(wampl),
              to: TypesConverter.toAddress(relayerIsRecipient ? relayer : tokenRecipient),
              value: await wampl.instance.wrapperToUnderlying(amount),
            },
            ampl
          );
        });
      }
    });
  });

  describe('complex actions', () => {
    let WETH: Token;
    let poolTokens: TokenList;
    let poolId: string;
    let pool: StablePool;
    let bptIndex: number;

    sharedBeforeEach('deploy pool', async () => {
      WETH = await Token.deployedAt(await vault.instance.WETH());
      poolTokens = new TokenList([WETH, wampl]).sort();

      pool = await StablePool.create({ tokens: poolTokens, vault });
      poolId = pool.poolId;
      bptIndex = await pool.getBptIndex();

      await WETH.mint(senderUser, fp(2));
      await WETH.approve(vault, MAX_UINT256, { from: senderUser });
      await WETH.mint(admin, fp(20));

      await ampl.mint(admin, amplFP(6000), { from: admin });
      await ampl.approve(wampl, amplFP(6000), { from: admin });
      await wampl.instance.connect(admin).mint(fp(6));

      await WETH.approve(vault, MAX_UINT256, { from: admin });
      await wampl.approve(vault, MAX_UINT256, { from: admin });
      const { tokens: allTokens } = await pool.getTokens();
      const wethIndex = allTokens.indexOf(WETH.address);

      const initialBalances = Array.from({ length: 3 }).map((_, i) =>
        i == bptIndex ? 0 : i == wethIndex ? fp(2) : fp(6)
      );

      // Seed liquidity in pool
      await pool.init({ initialBalances, from: admin });
    });

    describe('swap', () => {
      function encodeSwap(params: {
        poolId: string;
        kind: SwapKind;
        tokenIn: Token;
        tokenOut: Token;
        amount: BigNumberish;
        sender: Account;
        recipient: Account;
        outputReference?: BigNumberish;
      }): string {
        return relayerLibrary.interface.encodeFunctionData('swap', [
          {
            poolId: params.poolId,
            kind: params.kind,
            assetIn: params.tokenIn.address,
            assetOut: params.tokenOut.address,
            amount: params.amount,
            userData: '0x',
          },
          {
            sender: TypesConverter.toAddress(params.sender),
            recipient: TypesConverter.toAddress(params.recipient),
            fromInternalBalance: false,
            toInternalBalance: false,
          },
          0,
          MAX_UINT256,
          0,
          params.outputReference ?? 0,
        ]);
      }

      describe('swap using ampl as an input', () => {
        let receipt: ContractReceipt;
        const amount = amplFP(1);

        sharedBeforeEach('swap ampl for WETH', async () => {
          receipt = await (
            await relayer.connect(senderUser).multicall([
              encodeWrap(senderUser.address, relayer.address, amount, toChainedReference(0)),
              encodeApprove(wampl, MAX_UINT256),
              encodeSwap({
                poolId,
                kind: SwapKind.GivenIn,
                tokenIn: wampl,
                tokenOut: WETH,
                amount: toChainedReference(0),
                sender: relayer,
                recipient: recipientUser,
                outputReference: 0,
              }),
            ])
          ).wait();
        });

        it('performs the given swap', async () => {
          expectEvent.inIndirectReceipt(receipt, vault.instance.interface, 'Swap', {
            poolId,
            tokenIn: wampl.address,
            tokenOut: WETH.address,
          });

          expectTransferEvent(receipt, { from: vault.address, to: recipientUser.address }, WETH);
        });

        it('does not leave dust on the relayer', async () => {
          expect(await WETH.balanceOf(relayer)).to.be.eq(0);
          expect(await wampl.balanceOf(relayer)).to.be.eq(0);
        });
      });

      describe('swap using ampl as an output', () => {
        let receipt: ContractReceipt;
        const amount = amplFP(1);

        sharedBeforeEach('swap WETH for ampl', async () => {
          receipt = await (
            await relayer.connect(senderUser).multicall([
              encodeSwap({
                poolId,
                kind: SwapKind.GivenIn,
                tokenIn: WETH,
                tokenOut: wampl,
                amount,
                sender: senderUser,
                recipient: relayer,
                outputReference: toChainedReference(0),
              }),
              encodeUnwrap(relayer.address, recipientUser.address, toChainedReference(0)),
            ])
          ).wait();
        });

        it('performs the given swap', async () => {
          expectEvent.inIndirectReceipt(receipt, vault.instance.interface, 'Swap', {
            poolId,
            tokenIn: WETH.address,
            tokenOut: wampl.address,
          });

          expectTransferEvent(receipt, { from: wampl.address, to: recipientUser.address }, ampl);
        });

        it('does not leave dust on the relayer', async () => {
          expect(await WETH.balanceOf(relayer)).to.be.eq(0);
          expect(await wampl.balanceOf(relayer)).to.be.eq(0);
        });
      });
    });

    describe('batchSwap', () => {
      function encodeBatchSwap(params: {
        swaps: Array<{
          poolId: string;
          tokenIn: Token;
          tokenOut: Token;
          amount: BigNumberish;
        }>;
        sender: Account;
        recipient: Account;
        outputReferences?: Dictionary<BigNumberish>;
      }): string {
        const outputReferences = Object.entries(params.outputReferences ?? {}).map(([symbol, key]) => ({
          index: poolTokens.findIndexBySymbol(symbol),
          key,
        }));

        return relayerLibrary.interface.encodeFunctionData('batchSwap', [
          SwapKind.GivenIn,
          params.swaps.map((swap) => ({
            poolId: swap.poolId,
            assetInIndex: poolTokens.indexOf(swap.tokenIn),
            assetOutIndex: poolTokens.indexOf(swap.tokenOut),
            amount: swap.amount,
            userData: '0x',
          })),
          poolTokens.addresses,
          {
            sender: TypesConverter.toAddress(params.sender),
            recipient: TypesConverter.toAddress(params.recipient),
            fromInternalBalance: false,
            toInternalBalance: false,
          },
          new Array(poolTokens.length).fill(MAX_INT256),
          MAX_UINT256,
          0,
          outputReferences,
        ]);
      }

      describe('swap using ampl as an input', () => {
        let receipt: ContractReceipt;
        const amount = amplFP(1);

        sharedBeforeEach('swap ampl for WETH', async () => {
          receipt = await (
            await relayer.connect(senderUser).multicall([
              encodeWrap(senderUser.address, relayer.address, amount, toChainedReference(0)),
              encodeApprove(wampl, MAX_UINT256),
              encodeBatchSwap({
                swaps: [{ poolId, tokenIn: wampl, tokenOut: WETH, amount: toChainedReference(0) }],
                sender: relayer,
                recipient: recipientUser,
              }),
            ])
          ).wait();
        });

        it('performs the given swap', async () => {
          expectEvent.inIndirectReceipt(receipt, vault.instance.interface, 'Swap', {
            poolId: poolId,
            tokenIn: wampl.address,
            tokenOut: WETH.address,
          });

          expectTransferEvent(receipt, { from: vault.address, to: recipientUser.address }, WETH);
        });

        it('does not leave dust on the relayer', async () => {
          expect(await WETH.balanceOf(relayer)).to.be.eq(0);
          expect(await wampl.balanceOf(relayer)).to.be.eq(0);
        });
      });

      describe('swap using ampl as an output', () => {
        let receipt: ContractReceipt;
        const amount = amplFP(1);

        sharedBeforeEach('swap WETH for ampl', async () => {
          receipt = await (
            await relayer.connect(senderUser).multicall([
              encodeBatchSwap({
                swaps: [{ poolId, tokenIn: WETH, tokenOut: wampl, amount }],
                sender: senderUser,
                recipient: relayer,
                outputReferences: { wampl: toChainedReference(0) },
              }),
              encodeUnwrap(relayer.address, recipientUser.address, toChainedReference(0)),
            ])
          ).wait();
        });

        it('performs the given swap', async () => {
          expectEvent.inIndirectReceipt(receipt, vault.instance.interface, 'Swap', {
            poolId: poolId,
            tokenIn: WETH.address,
            tokenOut: wampl.address,
          });

          expectTransferEvent(receipt, { from: wampl.address, to: recipientUser.address }, ampl);
        });

        it('does not leave dust on the relayer', async () => {
          expect(await WETH.balanceOf(relayer)).to.be.eq(0);
          expect(await wampl.balanceOf(relayer)).to.be.eq(0);
        });
      });
    });

    describe('joinPool', () => {
      function encodeJoin(params: {
        poolId: string;
        sender: Account;
        recipient: Account;
        assets: string[];
        maxAmountsIn: BigNumberish[];
        userData: string;
        outputReference?: BigNumberish;
      }): string {
        return relayerLibrary.interface.encodeFunctionData('joinPool', [
          params.poolId,
          0, // WeightedPool
          TypesConverter.toAddress(params.sender),
          TypesConverter.toAddress(params.recipient),
          {
            assets: params.assets,
            maxAmountsIn: params.maxAmountsIn,
            userData: params.userData,
            fromInternalBalance: false,
          },
          0,
          params.outputReference ?? 0,
        ]);
      }

      let receipt: ContractReceipt;
      let senderWamplBalanceBefore: BigNumber;
      const amount = amplFP(1);

      sharedBeforeEach('join the pool', async () => {
        senderWamplBalanceBefore = await wampl.balanceOf(senderUser);
        const { tokens: allTokens } = await pool.getTokens();

        receipt = await (
          await relayer.connect(senderUser).multicall([
            encodeWrap(senderUser.address, relayer.address, amount, toChainedReference(0)),
            encodeApprove(wampl, MAX_UINT256),
            encodeJoin({
              poolId,
              assets: allTokens,
              sender: relayer,
              recipient: recipientUser,
              maxAmountsIn: Array(poolTokens.length + 1).fill(MAX_UINT256),
              userData: StablePoolEncoder.joinExactTokensInForBPTOut(
                poolTokens.map((token) => (token === wampl ? toChainedReference(0) : 0)),
                0
              ),
            }),
          ])
        ).wait();
      });

      it('joins the pool', async () => {
        expectEvent.inIndirectReceipt(receipt, vault.instance.interface, 'PoolBalanceChanged', {
          poolId,
          liquidityProvider: relayer.address,
        });

        // BPT minted to recipient
        expectTransferEvent(receipt, { from: ZERO_ADDRESS, to: recipientUser.address }, pool);
      });

      it('does not take wampl from the user', async () => {
        const senderWamplBalanceAfter = await wampl.balanceOf(senderUser);
        expect(senderWamplBalanceAfter).to.be.eq(senderWamplBalanceBefore);
      });

      it('does not leave dust on the relayer', async () => {
        expect(await WETH.balanceOf(relayer)).to.be.eq(0);
        expect(await wampl.balanceOf(relayer)).to.be.eq(0);
      });
    });
  });
});
