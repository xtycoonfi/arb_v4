require('dotenv').config();
const { ethers } = require('ethers');
const JSBI = require('jsbi');
const { TickMath, FullMath } = require('@uniswap/v3-sdk');

const rpc = process.env.PROVIDER_URL;
// const provider = new ethers.JsonRpcProvider(rpc);
const provider = new ethers.WebSocketProvider(rpc);



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

const quoter2Contract = [
	`0x61fFE014bA17989E743c5F6cB21bF9697530B21e`, 
]

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

function sqrtToPrice(sqrtValue, decimals0, decimals1, token0Inputed) {
	const numerator = sqrtValue ** 2;
	const denominator = 2 ** 192;
	let ratio = numerator / denominator;
	const shiftDecimals = Math.pow(10, decimals0 - decimals1);
	ratio = ratio * shiftDecimals;

	if(!token0Inputed) {
		ratio = 1 / ratio;
	}

	return ratio;
}


async function priceImpact(tokenIn, tokenOut, fee, amount) {
	const poolAddress = poolsUni[0];
	const poolContract = new ethers.Contract(
		poolAddress,
		['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint16 feeProtocol, bool unlocked)',
			'function fee() view returns (uint24)'],
		provider
	);
	const poolName = 'Uniswap';
	const slot0 = await poolContract.slot0();
	const sqrtPriceX96 = slot0.sqrtPriceX96();
	const token0 = poolContract.token0();
	const token1 = poolContract.token1();

	const token0Inputed = tokenIn === token[0];

	const quoterABI = [

	];
	
	const params = {
		tokenIn: tokenIn,
		tokenOut: tokenOut,
		fee: fee,
		amount: amount,
		sqrtPriceLimitX96: `0`, // not using in production
	}
	const quote = await quoter.callStatic.quoteExactInputSingle(params); // Important to callStatic for the swap not to be made. 
	const sqrtPriceX96After = quote.sqrtPriceX96After;
	const price = sqrtToPrice(sqrtPriceX96, decimalsIn, decimalsOut, token0Inputed)
	const priceAfter = sqrtToPrice(sqrtPriceX96After, decimalsIn, decimalsOut, token0Inputed)

	console.log(`${poolName} => ${token1.symbol}/${token2.symbol}`);
	console.log(`price`, price);
	console.log(`priceAfter`, priceAfter);

	const absoluteChange = price - priceAfter;
	const percentChange = absoluteChange / price;
	console.log(`percent change`, (percentChange * 100).toFixed(3),`%`);


}


async function checkPoolPrices(token1, token2, amount, tick, poolName, poolFee) {
	const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
	const ratioX192 = JSBI.multiply(sqrtRatioX96, sqrtRatioX96);
	const token1Amount = JSBI.BigInt(amount * 10 ** token1.decimals);
	const shift = JSBI.leftShift(JSBI.BigInt(1), JSBI.BigInt(192));
	const quoteAmount = FullMath.mulDivRoundingUp(ratioX192, token1Amount, shift);
	const poolFeeInt = Math.floor(poolFee * 100);
	const feeAmount = FullMath.mulDivRoundingUp(quoteAmount, JSBI.BigInt(poolFeeInt), JSBI.BigInt(100));
	const quoteMinusFee = JSBI.subtract(quoteAmount, feeAmount);
	const formattedQuoteAmount = (quoteAmount.toString() / 10 ** token2.decimals).toFixed(15);
	const formattedQuoteMinusFee = (quoteMinusFee.toString() / 10 ** token2.decimals).toFixed(15);
	console.log(`${poolName} => ${token1.symbol}/${token2.symbol}: ${formattedQuoteAmount} | Pool fee: ${poolFee}% | ${formattedQuoteMinusFee}`);
	return formattedQuoteMinusFee;
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
		const priceUni = await checkUniPoolPrices(tokenUni, token2Uni, amountUni, poolUni);

		const tokenQuick = tokens[0];
		const token2Quick = tokens[1];
		const amountQuick = 1;
		const priceQuick = await checkQuickPoolPrices(tokenQuick, token2Quick, amountQuick, poolQuick);

		const priceDiff = Math.abs(priceUni - priceQuick);
		const formattedPriceDiff = priceDiff.toLocaleString(undefined, { minimumFractionDigits: 18, maximumFractionDigits: 18 });

		console.log(`Opportunity => Uniswap to Quickswap for ${tokenUni.symbol}/${token2Uni.symbol} pool => ${formattedPriceDiff} ${token2Uni.symbol}/${tokenUni.symbol}`);
		const blockNumber = await provider.getBlockNumber();
		console.log('Current Block Number', blockNumber);
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
