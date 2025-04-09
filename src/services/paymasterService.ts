import { UserOperation } from '../types/userOperation.js';
import { ethers, solidityPacked } from 'ethers';
import { PaymasterConfig } from '../config/index.js';

export class PaymasterService {
  private readonly VALIDITY_WINDOW_SECONDS = 3600; // 1 hour
  private readonly VALIDITY_BEFORE_SECONDS = 60; // 1 minute
  private readonly DEFAULT_MODE = 1; // mode in bits 1-7, allowAllBundlers in bit 0

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

  private getValidityTimeWindow(): { validUntil: number, validAfter: number } {
    const now = Math.floor(Date.now() / 1000);
    return {
      validUntil: now + this.VALIDITY_WINDOW_SECONDS,
      validAfter: now - this.VALIDITY_BEFORE_SECONDS
    };
  }

  private createPaymasterDataWithoutSignature(
    paymasterAddress: string,
    verificationGasLimit: bigint | number | string,
    postOpGasLimit: bigint | number | string,
    validUntil: number,
    validAfter: number
  ): string {
    return solidityPacked(
      ['address', 'uint128', 'uint128', 'uint8', 'uint48', 'uint48'],
      [
        paymasterAddress,
        BigInt(verificationGasLimit),
        BigInt(postOpGasLimit),
        this.DEFAULT_MODE,
        BigInt(validUntil),
        BigInt(validAfter)
      ]
    );
  }

  private createPaymasterData(
    validUntil: number,
    validAfter: number,
    signature: string
  ): string {
    const validUntilHex = ethers.toBeHex(validUntil).slice(2).padStart(12, '0');
    const validAfterHex = ethers.toBeHex(validAfter).slice(2).padStart(12, '0');

    return ethers.hexlify(ethers.concat([
      `0x0${this.DEFAULT_MODE}`,
      `0x${validUntilHex}`,
      `0x${validAfterHex}`,
      signature
    ]));
  }

  async getPaymasterStubData(
    id: number,
    params: any[],
    chainId: string
  ): Promise<any> {
    try {
      if (params.length < 4) {
        throw new Error('Invalid params: expected at least 4 parameters');
      }

      const userOp = params[0];

      if (!this.chainRuntimes[chainId]) {
        throw new Error(`Chain ${chainId} not supported`);
      }

      const { paymasterContract, signer } = this.chainRuntimes[chainId];

      const { validUntil, validAfter } = this.getValidityTimeWindow();

      const paymasterAndDataWithOutSignature = this.createPaymasterDataWithoutSignature(
        paymasterContract.target.toString(),
        userOp.paymasterVerificationGasLimit || 0,
        userOp.paymasterPostOpGasLimit || 0,
        validUntil,
        validAfter
      );

      const userOpHash = this.getUserOpHash(userOp, paymasterAndDataWithOutSignature, Number(chainId));

      const signature = await signer.signMessage(
        ethers.getBytes(userOpHash)
      );

      const calculateGasLimits = (userOp: any) => {
        let verificationGas = 40000;

        const callDataLength = (userOp.callData.length - 2) / 2;
        verificationGas += callDataLength * 16;

        // If there's initCode, add deployment cost
        if (userOp.initCode && userOp.initCode !== '0x') {
          verificationGas += 40000; // Additional contract deployment cost
        }

        // Post-processing gas (usually smaller than verification gas)
        let postOpGas = 15000 + (callDataLength * 8); // Base cost + 8 gas per byte

        postOpGas = Math.max(postOpGas, 40000);

        return {
          verificationGas: Math.min(verificationGas, 150000),
          postOpGas: Math.min(postOpGas, 50000)
        };
      };

      const gasLimits = calculateGasLimits(userOp);

      const paymasterData = this.createPaymasterData(validUntil, validAfter, signature);

      const stubData = {
        "id": id,
        "result": {
          "paymaster": paymasterContract.target.toString(),
          "paymasterData": paymasterData,
          "paymasterPostOpGasLimit": `0x${gasLimits.postOpGas.toString(16)}`,
          "paymasterVerificationGasLimit": `0x${gasLimits.verificationGas.toString(16)}`
        },
        "jsonrpc": "2.0"
      }
      return stubData;
    } catch (error: unknown) {
      console.error("Error in getPaymasterStubData:", error);
      const errorMessage = error instanceof Error
        ? `${error.message}\n${error.stack}`
        : String(error);
      throw new Error(`Failed to generate paymaster stub data: ${errorMessage}`);
    }
  }

  /**
   * Get final paymaster data with signature
   * @param id - Request ID
   * @param params - Request parameters containing userOp
   * @param chainId - Chain ID for the operation
   * @returns Paymaster data with signature
   */
  async getPaymasterData(
    id: number,
    params: any[],
    chainId: string
  ): Promise<any> {
    try {
      if (params.length < 4) {
        throw new Error('Invalid params: expected at least 4 parameters');
      }

      const userOp = params[0];

      if (!this.chainRuntimes[chainId]) {
        throw new Error(`Chain ${chainId} not supported`);
      }

      const { paymasterContract, signer } = this.chainRuntimes[chainId];

      const { validUntil, validAfter } = this.getValidityTimeWindow();

      if (userOp.paymasterVerificationGasLimit === undefined) {
        throw new Error('Missing paymasterVerificationGasLimit in userOp');
      }
      if (userOp.paymasterPostOpGasLimit === undefined) {
        throw new Error('Missing paymasterPostOpGasLimit in userOp');
      }

      const paymasterAndDataWithOutSignature = this.createPaymasterDataWithoutSignature(
        paymasterContract.target.toString(),
        userOp.paymasterVerificationGasLimit,
        userOp.paymasterPostOpGasLimit,
        validUntil,
        validAfter
      );

      const userOpHash = this.getUserOpHash(userOp, paymasterAndDataWithOutSignature, Number(chainId));

      const signature = await signer.signMessage(
        ethers.getBytes(userOpHash)
      );

      const paymasterData = this.createPaymasterData(validUntil, validAfter, signature);

      console.log({
        message: "Generated paymaster data",
        paymaster: paymasterContract.target.toString(),
        paymasterData: paymasterData,
        signature: signature
      });

      const paymasterAndData = {
        "id": id,
        "result": {
          "paymaster": paymasterContract.target.toString(),
          "paymasterData": paymasterData,
        },
        "jsonrpc": "2.0"
      }
      return paymasterAndData;
    } catch (error: unknown) {
      console.error("Error in getPaymasterData:", error);
      const errorMessage = error instanceof Error
        ? `${error.message}\n${error.stack}`
        : String(error);
      throw new Error(`Failed to generate paymaster data: ${errorMessage}`);
    }
  }

  public async getUserOperationGasPrice(id: number, params: any[], chainId: string): Promise<any> {
    try {
      const { provider } = this.chainRuntimes[chainId];

      const feeData = await provider.getFeeData();

      let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || BigInt(1500000000);
      maxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(3) / BigInt(2);

      const slowMaxPriorityFee = maxPriorityFeePerGas * BigInt(80) / BigInt(100);
      const standardMaxPriorityFee = maxPriorityFeePerGas;
      const fastMaxPriorityFee = maxPriorityFeePerGas * BigInt(120) / BigInt(100);

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
    const verificationGasLimit = BigInt(userOp.verificationGasLimit || '0');
    const callGasLimit = BigInt(userOp.callGasLimit || '0');
    const accountGasLimits = this.packUint(verificationGasLimit, callGasLimit);

    const maxPriorityFeePerGasBigInt = BigInt(userOp.maxPriorityFeePerGas || '0');
    const maxFeePerGasBigInt = BigInt(userOp.maxFeePerGas || '0');
    const gasFees = this.packUint(maxPriorityFeePerGasBigInt, maxFeePerGasBigInt);

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