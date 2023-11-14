// SPDX-License-Identifier: MIT


import "@balancerV2/interfaces/contracts/vault/IVault.sol";
import "@balancerV2/interfaces/contracts/vault/IFlashLoanRecipient.sol";
import "@univ3/libraries/TransferHelper.sol";
import "@univ3/interfaces/ISwapRouter.sol";
import "@univ3/interfaces/ISwapRouterQuick.sol";
import "./minimalTokensInterface.sol"; // useful if we want to retrieve token0 and token1 from pool addresses. Both good for uni and quickswap
import "./IAlgebraPool.sol";
import "./IUniswapV3Pool.sol";


pragma solidity ^0.8.6;
pragma abicoder v2;

contract ArbitrageExecuter is IFlashLoanRecipient {
    
    IVault private _vault;                                                                       
    uint24 public constant poolFee   = 500;
    ISwapRouterQuick public quickRouter   = ISwapRouterQuick(0xf5b509bB0909a69B1c207E495f687a596C168E12);    
    ISwapRouter public uniRouter     = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);      
    
    IERC20 public WETH;
    IERC20 public WMATIC;
    IERC20 public LINK;
    IERC20 public USDC;
    IERC20 public QUICK;
    IERC20 public TEL;
      


    constructor(){
        // Init BalancerV2 vault address
        _vault = IVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
        WMATIC = IERC20(address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270));
        LINK = IERC20(address(0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39));
        USDC = IERC20(address(0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174));
        QUICK = IERC20(address(0xB5C064F955D8e7F38fE0460C556a72987494eE17));
        WETH = IERC20(address(0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619));
        TEL = IERC20(address(0xdF7837DE1F2Fa4631D716CF2502f8b230F1dcc32));
    }
    
    // This is the function that our bot will call
    // Every information to be used in receiveFlashLoan is encoded and passed as userData
    function makeFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external {
        // Simply forwards parameters to Vault
      _vault.flashLoan(IFlashLoanRecipient(this), tokens, amounts, userData);
    }

    //
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override {
        require(msg.sender == address(_vault));

        (   address router1,
            address router2,
            uint256 amount1_maxIn,
            uint256 amount1_out,
            uint256 amount2_maxIn,
            uint256 amount2_out
        ) = decodeUserData(userData);

        //Execute swap 1 - QUICKSWAP  WMATIC/USDC OUT
             swapExactOutputSingle(address(WMATIC), address(USDC), amount1_out, amount1_maxIn, router1, uint24(getQuickSwapFee(0xAE81FAc689A1b4b1e06e7ef4a2ab4CD8aC0A087D)));

      
        //Execute swap 2 - UNISWAP    USDC/WMATIC
        uniswap_swapExactInputSingle(address(USDC), address(WMATIC), IERC20(address(USDC)).balanceOf(address(this)), amount2_out, 500);
        
      
      
   
        
        repay(tokens, amounts, feeAmounts);
    }

    function repay(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts
        ) internal {
             
        for (uint i; i< tokens.length; ) {
            IERC20(address(tokens[i])).transfer(address(_vault), amounts[i] + feeAmounts[i]);
            ++i;
        }
    }
    // decode encode data
    // Structure is
    // Address Router, address pool1, address pool2, uint256 amount1_maxIn, uint256 amount1_out, uint256 amount2_maxIn, amount2 out
    // This is provisory. We need to enstablish if we retrieve all pool info on or off chain
    function decodeUserData(
        bytes memory userData
        ) internal pure returns (
        address, 
        address, 
        uint256, 
        uint256, 
        uint256, 
        uint256
        ) {
        return abi.decode(userData, (address, address, uint256, uint256, uint256, uint256));
    }

    function encodeUserData(
        address router1,
        address router2, 
        uint256 amount1_maxIn, 
        uint256 amount1_out, 
        uint256 amount2_maxIn, 
        uint256 amount2_out
        ) public pure returns (bytes memory){
            return abi.encode(
                router1,
                router2,
                amount1_maxIn, 
                amount1_out, 
                amount2_maxIn, 
                amount2_out
            );
        }

    function getQuickSwapFee(address pool) internal view returns (uint16){
        (,,uint16 fee,,,,) = IAlgebraPool(pool).globalState();
        return fee;
    }
    
    function getUniSwapFee(address pool) internal view returns (uint24){
        return IUniswapV3Pool(pool).fee();
    }


    function swapExactOutputSingle(
        address tokenIn, 
        address tokenOut, 
        uint256 amountOut, 
        uint256 amountInMaximum, 
        address router,
        uint24 fee
    ) public returns (uint256 amountIn) {
     
        // Approve the router to spend the specifed `amountInMaximum` of tokenIn.
        // In production, you should choose the maximum amount to spend based on oracles or other data sources to acheive a better swap.
        TransferHelper.safeApprove(tokenIn, address(router), amountInMaximum);

        ISwapRouter.ExactOutputSingleParams memory params =
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp,
                amountOut: amountOut,
                amountInMaximum: amountInMaximum,
                sqrtPriceLimitX96: 0
            });

        // Executes the swap returning the amountIn needed to spend to receive the desired amountOut.
        amountIn = ISwapRouter(router).exactOutputSingle(params);
    }

     
    function uniswap_swapExactInputSingle(
        address tokenIn, 
        address tokenOut, 
        uint256 amountIn, 
        uint256 amountOutMin,
        uint24 fee
        ) public returns (uint256 amountOut) {
        
        TransferHelper.safeApprove(tokenIn, address(uniRouter), amountIn);

        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                recipient: address(this),
                fee: fee,
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin, 
                sqrtPriceLimitX96: 0 
            });
        // The call to `exactInputSingle` executes the swap.
        amountOut = ISwapRouter(uniRouter).exactInputSingle(params);
    }

    function quick_swapExactInputSingle(
        address tokenIn, 
        address tokenOut, 
        uint256 amountIn, 
        uint256 amountOutMin
        ) public returns (uint256 amountOut) {
        // Approve the router to spend WMATIC.
        TransferHelper.safeApprove(tokenIn, address(quickRouter), amountIn);

        ISwapRouterQuick.QuickExactInputSingleParams memory params =
            ISwapRouterQuick.QuickExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin, // BEWARD NOT TO SEND THIS IF amountOUTMinim is 0. Will end up in loss of funds, need to update
                sqrtPriceLimitX96: 0 // default to 0, means we are not using it ( i don't even know what the fuck it is )
            });
        // The call to `exactInputSingle` executes the swap.
        amountOut = ISwapRouterQuick(quickRouter).exactInputSingle(params);
    }

}


