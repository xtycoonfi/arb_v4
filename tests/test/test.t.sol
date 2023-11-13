// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;

import "std/test.sol";
import "../src/arbitrageExecuter.sol";
import "std/console.sol";

contract Test_Sample is Test {

    ISwapRouter public quickRouter   = ISwapRouter(0xf5b509bB0909a69B1c207E495f687a596C168E12);    // Routerv1 of quickswapv3
    ISwapRouter public uniRouter     = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);      // Routerv1 of uniswapv3
    
    address QUICKusdc =     0x022df0b3341B3A0157EEA97dD024A93f7496D631;
    address Quickwmatic =   0x9F1A8cAF3C8e94e43aa64922d67dFf4dc3e88A42;
    address WmaticUsdc =    0xAE81FAc689A1b4b1e06e7ef4a2ab4CD8aC0A087D;


    IERC20 public WMATIC;
    IERC20 public LINK;
    IERC20 public USDC;
    IERC20 public QUICK;
    ArbitrageExecuter public arbitrageExecuter;

 
    function setUp() public {
        // deploy ArbitrageExecuter
        arbitrageExecuter = new ArbitrageExecuter();
        // Declare token addresses for naive tests
        WMATIC = IERC20(address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270));
        LINK = IERC20(address(0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39));
        USDC = IERC20(address(0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174));
        QUICK = IERC20(address(0xB5C064F955D8e7F38fE0460C556a72987494eE17));

        console.log("arbitrageExecuter address: ", address(arbitrageExecuter));
    }


    // Naive test to be refactored
   /* function testSwapOut() public {
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
*/
    function testOp() public {
        bytes memory userData = arbitrageExecuter.encodeUserData(
            address(quickRouter),
             Quickwmatic, 
             QUICKusdc, 
             WmaticUsdc, 
             658300000000000000, 
             10e18, 
             10e18, 
             1e18
        );
    
        IERC20[] memory erc20List = new IERC20[](1);
        erc20List[0] = WMATIC;
        uint[] memory amounts = new uint[](1);
        amounts[0] = 1e18;
       
        deal(address(WMATIC), address(arbitrageExecuter), 1e27);
        arbitrageExecuter.makeFlashLoan(erc20List, amounts, userData);
        console.log("Quick balance: ", IERC20(QUICK).balanceOf(address(arbitrageExecuter)));
        if ( IERC20(WMATIC).balanceOf(address(arbitrageExecuter)) > 1e27)  {
            console.log("Wmatic earnings: ", IERC20(WMATIC).balanceOf(address(arbitrageExecuter)) - 1e27 );
        }
    }


}

