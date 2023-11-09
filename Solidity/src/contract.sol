// SPDX-License-Identifier: MIT


import "@balancerV2/interfaces/contracts/vault/IVault.sol";
import "@balancerV2/interfaces/contracts/vault/IFlashLoanRecipient.sol";

pragma solidity ^0.8.6;


contract FlashLoanRecipient is IFlashLoanRecipient {
    IVault private _vault;
    address public USDC = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063;
    uint256 public amountLoaned;
    constructor(){
        _vault = IVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);
    }
    

    function makeFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external {
      _vault.flashLoan(IFlashLoanRecipient(this), tokens, amounts, userData);
    }

    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override {
        require(msg.sender == address(_vault));
        amountLoaned = IERC20(USDC).balanceOf(address(this));
        IERC20(USDC).transfer(address(_vault), IERC20(USDC).balanceOf(address(this)));
    }
}
