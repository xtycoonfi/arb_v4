// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;

import "std/test.sol";
import "../src/contract.sol";

contract Test_Sample is Test {
    IERC20 public USDC;
    FlashLoanRecipient public flr;

    IERC20[] public erc20List;
    uint256[] public amounts;
    function setUp() public {
        flr = new FlashLoanRecipient();
        USDC = IERC20(address(0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063));
        erc20List.push(USDC);
        amounts.push(1e22);
    }
    
    function testLoan() public {
        flr.makeFlashLoan(erc20List, amounts, "");
        assertTrue(flr.amountLoaned() == 1e22);
    }
}
