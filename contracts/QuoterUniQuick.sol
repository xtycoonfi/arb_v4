// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;
pragma abicoder v2;
// Contract available at polygon mainnet address : 0x4A469BC7d6fd5e33D3b0109D21f75C6f908670de
contract QuoterUniQuick {
           
    StaticQuoter public quickQuoter;
    StaticQuoter public uniQuoter;

    constructor(){
        quickQuoter = StaticQuoter(0x2E0A046481c676235B806Bd004C4b492C850fb34);
        uniQuoter   = StaticQuoter(0x7637Aaeb5BD58269B782726680d83f72C651aE74);
    }
    struct Pair {
        address uniPool;                // Address of the uniswap pool
        address quickPool;              // Address of the quickswap pool
        address token0;                 // Address of token 0  (Not necessarely equal to pool token0)
        address token1;                 // Address of token 1  (Not necessarely equal to pool token1)
        uint    token0_AmountIn_Uni;    // AmountIn of token0 into uni
        uint    token1_AmountIn_Uni;    // AmountIn of token1 into uni
        uint    token0_AmountIn_Quick;  // AmountIn of token0 into quick
        uint    token1_AmountIn_Quick;  // AmountIn of token1 into quick
    }
    struct PairData {
        uint uniOut0;                   
        uint uniOut1;
        uint quickOut0;
        uint quickOut1;
        uint24 uniFee;
        uint16 quickFee;
    }
    
    function getPoolData(Pair[] memory pairs) public view returns (PairData[] memory){
        // Initialize PairData array
        PairData[] memory pairData = new PairData[](pairs.length);
        for (uint i; i < pairs.length; ++i){
            // Get UniSwap Fee for uniPool
            uint24 uniFee = IUniswapV3Pool(pairs[i].uniPool).fee(); 
            // Get QuickSwap Fee por quickPool
            (,, uint16 quickFee,,,,) = IAlgebraPool(pairs[i].quickPool).globalState();
            // Store fees into struct
            pairData[i].uniFee = uniFee;
            pairData[i].quickFee = quickFee;

            // Get amountOut given amount in for uniSwap in both directions
            bytes  memory uniPath = abi.encodePacked(pairs[i].token0, uint24(uniFee), pairs[i].token1);
            pairData[i].uniOut0 = uniQuoter.quoteExactInput(uniPath, pairs[i].token0_AmountIn_Uni);
                         uniPath = abi.encodePacked(pairs[i].token1, uint24(uniFee), pairs[i].token0);
            pairData[i].uniOut1 = uniQuoter.quoteExactInput(uniPath, pairs[i].token1_AmountIn_Uni);
            // Get amountOut given amount in for quickSwap in both directions     
            bytes memory quickPath = abi.encodePacked(pairs[i].token0, pairs[i].token1);
            pairData[i].quickOut0 = quickQuoter.quoteExactInput(quickPath, pairs[i].token0_AmountIn_Quick);
                         quickPath = abi.encodePacked(pairs[i].token1, pairs[i].token0);
            pairData[i].quickOut1 = quickQuoter.quoteExactInput(quickPath, pairs[i].token1_AmountIn_Quick);
        }
        return pairData;
    }
}
interface StaticQuoter  {
    function quoteExactInput(
        bytes memory path, 
        uint256 amountIn
    ) external view returns (uint256 amountOut);
}
interface IAlgebraPool {
    function globalState()
    external
    view
    returns (
      uint160 price,
      int24 tick,
      uint16 fee,
      uint16 timepointIndex,
      uint8 communityFeeToken0,
      uint8 communityFeeToken1,
      bool unlocked
    );
}
interface IUniswapV3Pool {
    function fee() external view returns (uint24);
}
