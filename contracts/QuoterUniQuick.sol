// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.19;
pragma abicoder v2;
// deployed on Polygon mainnet at address: 0x78a24Eb6489B6Ea65cE7F6C94aaa7db9024BEdF1

contract QuoterUniQuick {
           
    StaticQuoter public quickQuoter;
    StaticQuoter public uniQuoter;

    constructor(){
      
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

    function getPoolDatay(Pair[] memory pairs) external view  returns (PairData[] memory, uint){
        return (_getPoolData(pairs), block.number);
    }
    function _getPoolData(Pair[] memory pairs) internal view returns (PairData[] memory){
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
