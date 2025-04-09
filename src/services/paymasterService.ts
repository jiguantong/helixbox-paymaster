import { UserOperation } from '../types/userOperation.js';
import { ethers, solidityPacked } from 'ethers';
import { PaymasterConfig } from '../config/index.js';

export class PaymasterService {

  private chainRuntimes: {
    [key: string]: {
      provider: ethers.JsonRpcProvider;
      paymasterContract: ethers.Contract;
      signer: ethers.Wallet;
    }
  } = {};

  constructor(config: PaymasterConfig) {
    for (const chainId in config.chains) {
      const _provider = new ethers.JsonRpcProvider(config.chains[chainId].rpc);
      this.chainRuntimes[chainId] = {
        provider: _provider,
        paymasterContract: new ethers.Contract(
          config.chains[chainId].paymasterAddress,
          config.paymasterAbi,
          _provider
        ),
        signer: new ethers.Wallet(config.chains[chainId].paymasterPrivateKey || config.paymasterPrivateKey, _provider)
      };
    }
  }

  async getPaymasterStubData(
    id: number,
    params: any[],
    chainId: string
  ): Promise<any> {
    try {
      if (params.length < 4) {
        throw new Error('Invalid params');
      }

      const userOp = params[0];

      if (!this.chainRuntimes[chainId]) {
        throw new Error(`Chain ${chainId} not supported`);
      }

      const { paymasterContract, signer } = this.chainRuntimes[chainId];

      // Set validity time window
      const validUntil = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour
      const validAfter = Math.floor(Date.now() / 1000) - 60; // Valid from 1 minute ago

      const paymasterAndDataWithOutSignature = solidityPacked(
        ['address', 'uint128', 'uint128', 'uint8', 'uint48', 'uint48'],
        [
          "0xDE31CDdee69441D6F1D35E3486DA444bbA43573e",
          BigInt(userOp.paymasterVerificationGasLimit || 0),
          BigInt(userOp.paymasterPostOpGasLimit || 0),
          1, // mode in bits 1-7, allowAllBundlers in bit 0
          BigInt(validUntil),              // 6 bytes timestamp
          BigInt(validAfter)               // 6 bytes timestamp
        ]
      );

      const userOpHash = this.getUserOpHash(userOp, paymasterAndDataWithOutSignature, Number(chainId));

      const signature = await signer.signMessage(
        ethers.getBytes(userOpHash)
      );
      // Calculate the gas needed for verification and post-processing
      const calculateGasLimits = (userOp: any) => {
        // Base verification gas (fixed cost)
        let verificationGas = 40000;

        // Increase verification gas based on callData size
        const callDataLength = (userOp.callData.length - 2) / 2; // Remove '0x' and calculate byte count
        verificationGas += callDataLength * 16; // 16 gas per byte

        // If there's initCode, add deployment cost
        if (userOp.initCode && userOp.initCode !== '0x') {
          verificationGas += 40000; // Additional contract deployment cost
        }

        // Post-processing gas (usually smaller than verification gas)
        let postOpGas = 15000 + (callDataLength * 8); // Base cost + 8 gas per byte

        // Ensure postOpGas is at least 40000 as required
        postOpGas = Math.max(postOpGas, 40000);

        return {
          verificationGas: Math.min(verificationGas, 150000), // Set cap
          postOpGas: Math.min(postOpGas, 50000) // Set cap
        };
      };

      const gasLimits = calculateGasLimits(userOp);

      // Mode and allowAllBundlers (using 0x01 for mode 0 and allowAllBundlers true)
      const modeAndAllowAllBundlers = '0x01';

      // Convert timestamps to 6 bytes
      const validUntilHex = ethers.toBeHex(validUntil).slice(2).padStart(12, '0');
      const validAfterHex = ethers.toBeHex(validAfter).slice(2).padStart(12, '0');

      // Build paymasterData
      const paymasterData = ethers.concat([
        modeAndAllowAllBundlers,                      // mode and allowAllBundlers (1 byte)
        `0x${validUntilHex}`,                         // validUntil (6 bytes)
        `0x${validAfterHex}`,                         // validAfter (6 bytes)
        signature                                      // signature (65 bytes)
      ]);

      const stubData = {
        "id": id,
        "result": {
          "paymaster": paymasterContract.target,
          "paymasterData": ethers.hexlify(paymasterData),
          "paymasterPostOpGasLimit": `0x${gasLimits.postOpGas.toString(16)}`,
          "paymasterVerificationGasLimit": `0x${gasLimits.verificationGas.toString(16)}`
        },
        "jsonrpc": "2.0"
      }
      return stubData;
    } catch (error: unknown) {
      console.error("Error in getPaymasterStubData:", error);
      throw new Error(`Failed to generate paymaster stub data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get final paymaster data with signature
   */
  async getPaymasterData(
    id: number,
    params: any[],
    chainId: string
  ): Promise<any> {
    try {
      if (params.length < 4) {
        throw new Error('Invalid params');
      }

      const userOp = params[0];

      if (!this.chainRuntimes[chainId]) {
        throw new Error(`Chain ${chainId} not supported`);
      }

      const { paymasterContract, signer } = this.chainRuntimes[chainId];

      // Set validity window
      const validUntil = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour
      const validAfter = Math.floor(Date.now() / 1000) - 60; // Valid from 1 minute ago

      const paymasterAndDataWithOutSignature = solidityPacked(
        ['address', 'uint128', 'uint128', 'uint8', 'uint48', 'uint48'],
        [
          "0xDE31CDdee69441D6F1D35E3486DA444bbA43573e",
          BigInt(userOp.paymasterVerificationGasLimit),
          BigInt(userOp.paymasterPostOpGasLimit),
          1, // mode in bits 1-7, allowAllBundlers in bit 0
          BigInt(validUntil),              // 6 bytes timestamp
          BigInt(validAfter)               // 6 bytes timestamp
        ]
      );

      const userOpHash = this.getUserOpHash(userOp, paymasterAndDataWithOutSignature, Number(chainId));

      // Sign the data
      const signature = await signer.signMessage(
        ethers.getBytes(userOpHash)
      );

      // Convert timestamps to 6 bytes
      const validUntilHex = ethers.toBeHex(validUntil).slice(2).padStart(12, '0');
      const validAfterHex = ethers.toBeHex(validAfter).slice(2).padStart(12, '0');

      // Build paymasterData
      const paymasterData = ethers.concat([
        `0x01`,                      // mode and allowAllBundlers (1 byte)
        `0x${validUntilHex}`,                         // validUntil (6 bytes)
        `0x${validAfterHex}`,                         // validAfter (6 bytes)
        signature                                      // signature (65 bytes)
      ]);
      console.log("### paymaster: \n", paymasterContract.target);
      console.log("### paymasterData: \n", paymasterData);
      console.log("### signature: \n", signature);

      const paymasterAndData = {
        "id": id,
        "result": {
          "paymaster": paymasterContract.target,
          "paymasterData": ethers.hexlify(paymasterData),
        },
        "jsonrpc": "2.0"
      }
      return paymasterAndData;
    } catch (error: unknown) {
      console.error("Error in getPaymasterData:", error);
      throw new Error(`Failed to generate paymaster data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async getUserOperationGasPrice(id: number, params: any[], chainId: string): Promise<any> {
    try {
      const { provider } = this.chainRuntimes[chainId];

      // Get the current gas price
      const feeData = await provider.getFeeData();

      // Calculate gas prices for different speeds
      let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || BigInt(1500000000); // 1.5 gwei
      maxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(3) / BigInt(2);

      // Slow = base fee + low priority fee
      const slowMaxPriorityFee = maxPriorityFeePerGas * BigInt(80) / BigInt(100);
      // Standard = base fee + standard priority fee
      const standardMaxPriorityFee = maxPriorityFeePerGas;
      // Fast = base fee + high priority fee
      const fastMaxPriorityFee = maxPriorityFeePerGas * BigInt(120) / BigInt(100);

      // Base fee
      const baseFee = feeData.gasPrice ? feeData.gasPrice - maxPriorityFeePerGas : BigInt(30000000000);

      return {
        "id": id,
        "result": {
          "fast": {
            "maxFeePerGas": `0x${((baseFee + fastMaxPriorityFee) * BigInt(3) / BigInt(2)).toString(16)}`,
            "maxPriorityFeePerGas": `0x${fastMaxPriorityFee.toString(16)}`
          },
          "slow": {
            "maxFeePerGas": `0x${((baseFee + slowMaxPriorityFee) * BigInt(3) / BigInt(2)).toString(16)}`,
            "maxPriorityFeePerGas": `0x${slowMaxPriorityFee.toString(16)}`
          },
          "standard": {
            "maxFeePerGas": `0x${((baseFee + standardMaxPriorityFee) * BigInt(3) / BigInt(2)).toString(16)}`,
            "maxPriorityFeePerGas": `0x${standardMaxPriorityFee.toString(16)}`
          }
        },
        "jsonrpc": "2.0"
      };
    } catch (error) {
      console.error("Error getting gas price:", error);
      throw new Error(`Failed to get gas price: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private packUint(high128: bigint | string | number, low128: bigint | string | number): string {
    const highBigInt = BigInt(high128);
    const lowBigInt = BigInt(low128);
    const result = (highBigInt << 128n) | lowBigInt;
    return ethers.zeroPadValue(ethers.toBeHex(result), 32);
  }

  private getUserOpHash(
    userOp: UserOperation,
    paymasterAndDataWithOutSignature: string,
    chainId: number
  ): string {
    // pack accountGasLimits
    const verificationGasLimit = BigInt(userOp.verificationGasLimit || '0');
    const callGasLimit = BigInt(userOp.callGasLimit || '0');
    const accountGasLimits = this.packUint(verificationGasLimit, callGasLimit);

    // pack gasFees
    const maxPriorityFeePerGasBigInt = BigInt(userOp.maxPriorityFeePerGas || '0');
    const maxFeePerGasBigInt = BigInt(userOp.maxFeePerGas || '0');
    const gasFees = this.packUint(maxPriorityFeePerGasBigInt, maxFeePerGasBigInt);


    // For debug
    // console.log("#### userOp encode", JSON.stringify([userOp.sender, userOp.nonce, userOp.initCode || '0x', userOp.callData || '0x', accountGasLimits, userOp.preVerificationGas, gasFees, userOp.paymasterAndData || '0x', userOp.signature || '0x']));
    // console.log("#### paymasterAndDataWithOutSignature", paymasterAndDataWithOutSignature);

    const userOpHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        [
          "address",
          "uint256",
          "uint256",
          "uint256",
          "uint256",
          "bytes32",
          "bytes32",
          "bytes32"
        ],
        [
          userOp.sender,
          userOp.nonce,
          accountGasLimits,
          userOp.preVerificationGas,
          gasFees,
          ethers.keccak256(userOp.initCode || '0x'),
          ethers.keccak256(userOp.callData || '0x'),
          ethers.keccak256(paymasterAndDataWithOutSignature)
        ]
      )
    );

    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint256"],
        [userOpHash, chainId]
      )
    );
  }
} 