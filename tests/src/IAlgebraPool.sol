// SPDX-License-Identifier: MIT


pragma solidity ^0.8.6;

interface IAlgebraPool {

    function token0() external view returns (address);
    function token1() external view returns (address);

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