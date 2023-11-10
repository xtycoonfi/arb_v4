// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;

import "std/test.sol";
import "../src/ArbitrageExecuter.sol";

contract Test_ArbitrageExecuter is Test {
    IERC20 public DAI;
    ArbitrageExecuter public flr;

    IERC20[] public erc20List;
    uint256[] public amounts;
    function setUp() public {
        flr = new ArbitrageExecuter();
        DAI = IERC20(address(0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063));
        erc20List.push(DAI);
        amounts.push(1e22);
    }
    
    function testLoan() public {
        flr.makeFlashLoan(erc20List, amounts, "");
        assertTrue(flr.amountLoaned() == 1e22);
    }
}
