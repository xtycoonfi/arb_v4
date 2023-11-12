require('dotenv').config()
const { ethers } = require('ethers');
const JSBI = require('jsbi');
const convert = require('ethereum-unit-converter');
//const { GasPriceOracle } = require('gas-price-oracle');
const { TickMath, FullMath } = require('@uniswap/v3-sdk');

let pk = process.env.PRIVATE_KEY;
let rpc = process.env.PROVIDER_URL;
let provider = new ethers.JsonRpcProvider(rpc);

//const options = {
//	chainId: 1,
//	defaultRpc: rpc,
//	timeout: 10000,
//	defaultFallbackGasPrices: {
//		instant: 215,
//		fast: 22,
//		standard: 18,
//		low: 12,
//	},
//};
//let network = 137;

console.log(rpc);
console.log(pk);

let aaveLoanUSDC = process.env.AAVE_FLASHLOAN_USDC;
let balLoanUSDC = process.env.BAL_FLASHLOAN_USDC;

let pools = [];

let USDC = '';
let WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
let WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599';

async function getCurrentTick() {
	//Need to get actual tick
}

async function checkPoolPrices(token1, token2, amount, tick, token1decimals, token2decimals) {
	const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
	const ratioX192 = JSBI.multiply(sqrtRatioX96, sqrtRatioX96);

	const token1Amount = JSBI.BigInt(amount * (10 ** token1decimals));
	const shift = JSBI.leftShift(JSBI.BigInt(1), JSBI.BigInt(192));

	quoteAmount = FullMath.mulDivRoundingUp(ratioX192, token1Amount, shift);
	console.log(quoteAmount.toString() / (10 ** token2decimals));
	// spam rpc every seconds to get prices
}

async function comparePools() {
	// check if arb opportunities
}

async function takeLoan() {
	// borrowMoney
}

async function repayLoan() {
	// repayMoney
}

async function buyTokenForToken() {
	// use uniswap fork to buy token for token
}

async function main() {
	// checkPoolPrices forEach PoolAddresses
	// comparePools
	// if opportunities 👇
	// borrowMoney
	// buyTokenForToken on cheapest dex
	// buyTokenForToker on higher dex
	// repay the loan
	// if no opportunities 👇
	// continue 
}

checkPoolPrices(WBTC, WETH, 1, 265000, 8, 18);