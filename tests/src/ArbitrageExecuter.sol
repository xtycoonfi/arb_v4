// SPDX-License-Identifier: MIT


import "@balancerV2/interfaces/contracts/vault/IVault.sol";
import "@balancerV2/interfaces/contracts/vault/IFlashLoanRecipient.sol";
import "@univ3/libraries/TransferHelper.sol";
import "@univ3/interfaces/ISwapRouter.sol";
import "./minimalTokensInterface.sol"; // useful if we want to retrieve token0 and token1 from pool addresses. Both good for uni and quickswap

pragma solidity ^0.8.6;
pragma abicoder v2;

contract ArbitrageExecuter is IFlashLoanRecipient {
    
    IVault private _vault;                                                                       //BalancerV2 vault interface
    uint24 public constant poolFee   = 3000;                                                       // placeholder fee, will fetch every fee on each pool via globalState()
    ISwapRouter public quickRouter   = ISwapRouter(0xf5b509bB0909a69B1c207E495f687a596C168E12);    // Routerv1 of quickswapv3
    ISwapRouter public uniRouter     = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);      // Routerv1 of uniswapv3
    
    constructor(){
        // Init BalancerV2 vault address
        _vault = IVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
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

        (   address router,
            address pool1,
            address pool2,
            address pool3,
            uint256 amount1_maxIn,
            uint256 amount1_out,
            uint256 amount2_maxIn,
            uint256 amount2_out
        ) = decodeUserData(userData);
        
        address pool1_token0 = minimalTokensInterface(pool1).token0();
        address pool1_token1 = minimalTokensInterface(pool1).token1();
        address pool2_token0 = minimalTokensInterface(pool2).token0();
     

        //Execute swap 1. WMATIC/QUICK
        swapExactOutputSingle(pool1_token0, pool1_token1, amount1_out, amount1_maxIn, router);
        //Execute swap 2 QUICK/USDC
        swapExactInputSingle(pool1_token1, pool2_token0, IERC20(pool1_token1).balanceOf(address(this)), amount2_maxIn, router);
        //Execute swap 3 WMATIC/USDC
        swapExactInputSingle(pool2_token0, pool1_token0, IERC20(pool2_token0).balanceOf(address(this)), amount2_maxIn, router);

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
    function decodeUserData(bytes memory userData) internal pure returns (address, address, address, address, uint256, uint256, uint256, uint256) {
        return abi.decode(userData, (address, address, address, address, uint256, uint256, uint256, uint256));
    }

    function encodeUserData(
        address router,
        address pool1,
        address pool2, 
        address pool3,
        uint256 amount1_maxIn, 
        uint256 amount1_out, 
        uint256 amount2_maxIn, 
        uint256 amount2_out
        ) public pure returns (bytes memory){
            return abi.encode(
                router,
                pool1, 
                pool2,
                pool3,
                amount1_maxIn, 
                amount1_out, 
                amount2_maxIn, 
                amount2_out
            );
        }

    // swap in order to receive exactly amountOut of tokenOut. 
    // useAmountInMaximum to set a cap on how much we are willing to pay to get at this amount
    // returns how much we made
    function swapExactOutputSingle(address tokenIn, address tokenOut, uint256 amountOut, uint256 amountInMaximum, address router) public returns (uint256 amountIn) {
     
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

     // TO DO, AVOID USING THIS FUNC FOR NOW
    function swapExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, address router) public returns (uint256 amountOut) {
        // Approve the router to spend WMATIC.
        TransferHelper.safeApprove(tokenIn, address(router), amountIn);

        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0, // BEWARD NOT TO SEND THIS IF amountOUTMinim is 0. Will end up in loss of funds, need to update
                sqrtPriceLimitX96: 0 // default to 0, means we are not using it ( i don't even know what the fuck it is )
            });
        // The call to `exactInputSingle` executes the swap.
        amountOut = ISwapRouter(router).exactInputSingle(params);
    }



}


