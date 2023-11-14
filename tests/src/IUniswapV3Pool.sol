// SPDX-License-Identifier: MIT


pragma solidity ^0.8.6;

interface IUniswapV3Pool {
    function fee() external view returns (uint24);
}