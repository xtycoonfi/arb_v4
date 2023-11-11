// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;

import "std/test.sol";
import "../src/contract.sol";
import "std/console.sol";

contract Test_Sample is Test {

    ISwapRouter public quickRouter = ISwapRouter(0xf5b509bB0909a69B1c207E495f687a596C168E12);    // Routerv1 of quickswapv3
    ISwapRouter public uniRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);      // Routerv1 of uniswapv3

    IERC20 public WMATIC;
    IERC20 public LINK;
    ArbitrageExecuter public arbitrageExecuter;

    IERC20[] public erc20List;
    uint256[] public amounts;
    function setUp() public {
        // deploy ArbitrageExecuter
        arbitrageExecuter = new ArbitrageExecuter();
        // Declare token addresses for naive tests
        WMATIC = IERC20(address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270));
        LINK = IERC20(address(0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39));
        console.log("arbitrageExecuter address: ", address(arbitrageExecuter));
    }
    
    // This is broken due to new changes, to be refactored.
    function testLoan() public {
        erc20List.push(WMATIC);
        amounts.push(1e22);
        arbitrageExecuter.makeFlashLoan(erc20List, amounts, "");
        
    }

    // Naive test to be refactored
    function testSwapOut() public {
        deal(address(WMATIC), address(arbitrageExecuter), 1e27);
        console.log("Pool LINK Balance before", IERC20(LINK).balanceOf(0x33bc9A6a200752ddd44F41dD978977E0699cC00d));
        arbitrageExecuter.swapExactOutputSingle(
            address(WMATIC), 
            address(LINK), 
            1e18,
            1e27,
            address(quickRouter));
        console.log("Pool LINK Balance after ", IERC20(LINK).balanceOf(0x33bc9A6a200752ddd44F41dD978977E0699cC00d));
        console.log("LINK Balance", IERC20(LINK).balanceOf(address(arbitrageExecuter)));
        console.log("WMATIC Balance", IERC20(WMATIC).balanceOf(address(arbitrageExecuter)));
    }    
}

