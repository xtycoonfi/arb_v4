require('dotenv').config();
const { ethers } = require('ethers');
const JSBI = require('jsbi');
const { TickMath, FullMath } = require('@uniswap/v3-sdk');

const rpc = process.env.PROVIDER_URL;
const provider = new ethers.JsonRpcProvider(rpc);

const tokens = [
	// {
	//     name: 'USDC',
	//     symbol: 'USDC',
	//     address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
	//     decimals: 6,
	// },
	// {
	//     name: 'WBTC',
	//     symbol: 'WBTC',
	//     address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
	//     decimals: 8,
	// },
	{
		name: 'WMATIC',
		symbol: 'WMATIC',
		address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
		decimals: 18,
	},
	{
		name: 'WETH',
		symbol: 'WETH',
		address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
		decimals: 18,
	},
];

const poolsUni = [
	'0x86f1d8390222a3691c28938ec7404a1661e618e0', // WMATIC_WETH_UNIV3
	// '0x45dda9cb7c25131df268515131f647d726f50608', // USDC_WETH_UNIV3
	// '0x50eaedb835021e4a108b7290636d62e9765cc6d7', // WBTC_WETH_UNIV3
];

const poolsQuick = [
	'0x479e1b71a702a595e19b6d5932cd5c863ab57ee0', // WMATIC_WETH_QUICKV3
];

async function getUniCurrentTick(poolContract) {
	const { tick } = await poolContract.slot0();
	return Number(tick);
}

async function getUniCurrentFee(poolContract) {
	const fee = await poolContract.fee();
	return (Number(fee) / 10000);
}

async function getQuickCurrentTick(poolContract) {
	const { tick } = await poolContract.globalState();
	return Number(tick);
}

async function getQuickCurrentFee(poolContract) {
	const { fee } = await poolContract.globalState();
	return (Number(fee) / 10000);
}


async function checkPoolPrices(token1, token2, amount, tick, poolName, poolFee) {
	const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
	const ratioX192 = JSBI.multiply(sqrtRatioX96, sqrtRatioX96);
	const token1Amount = JSBI.BigInt(amount * 10 ** token1.decimals);
	const shift = JSBI.leftShift(JSBI.BigInt(1), JSBI.BigInt(192));
	const quoteAmount = FullMath.mulDivRoundingUp(ratioX192, token1Amount, shift);
	console.log(`${poolName} => ${token1.symbol}/${token2.symbol}: ${quoteAmount.toString() / 10 ** token2.decimals} | Pool fee : ${poolFee}%`);
}

async function checkUniPoolPrices(token1, token2, amount, tick) {
	const poolAddress = poolsUni[0];
	const poolContract = new ethers.Contract(
		poolAddress,
		['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint16 feeProtocol, bool unlocked)',
			'function fee() view returns (uint24)'],
		provider
	);
	const poolName = 'Uniswap';
	const currentTick = await getUniCurrentTick(poolContract);
	const poolFee = await getUniCurrentFee(poolContract)
	await checkPoolPrices(token1, token2, amount, currentTick, poolName, poolFee);
}

async function checkQuickPoolPrices(token1, token2, amount) {
	const poolAddress = poolsQuick[0];
	const poolContract = new ethers.Contract(
		poolAddress,
		['function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)'],
		provider
	);
	const poolName = 'Quickswap';
	const currentTick = await getQuickCurrentTick(poolContract);
	const poolFee = await getQuickCurrentFee(poolContract);
	await checkPoolPrices(token1, token2, amount, currentTick, poolName, poolFee);
}

async function comparePools() {
	for (let i = 0; i < poolsUni.length && i < poolsQuick.length; i++) {
		const poolUni = poolsUni[i];
		const poolQuick = poolsQuick[i];

		const tokenUni = tokens[0];
		const token2Uni = tokens[1];
		const amountUni = 1;
		await checkUniPoolPrices(tokenUni, token2Uni, amountUni, poolUni);

		const tokenQuick = tokens[0];
		const token2Quick = tokens[1];
		const amountQuick = 1;
		await checkQuickPoolPrices(tokenQuick, token2Quick, amountQuick, poolQuick);
	}
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

async function start() {
	await comparePools();
}

start();
