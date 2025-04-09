import { UserOperation } from '../types/userOperation.js';
import { ethers, solidityPacked } from 'ethers';

export class PaymasterService {
  private provider: ethers.JsonRpcProvider;
  private paymasterContract: ethers.Contract;
  private signer: ethers.Wallet;

  constructor(config: any) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.paymasterPrivateKey, this.provider);
    this.paymasterContract = new ethers.Contract(
      config.paymasterAddress,
      config.paymasterAbi,
      this.signer
    );
  }

  async getPaymasterStubData(
    id: number,
    params: any[] // [{"callData":"0x541d63c8000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000021234000000000000000000000000000000000000000000000000000000000000","maxFeePerGas":"0x3e4f9bc6","maxPriorityFeePerGas":"0x12dd2c","nonce":"0x195a89bac4d0000000000000000","sender":"0x2c01A42371dDa22fE7731601F712f963BD4c3B38","signature":"0x000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","callGasLimit":"0x0","verificationGasLimit":"0x0","preVerificationGas":"0x0"},"0x0000000071727De22E5E9d8BAf0edAc6f37da032","0xaa36a7",null]
  ): Promise<any> {
    try {
      // Ensure paymaster address is valid
      if (!this.paymasterContract.target || typeof this.paymasterContract.target !== 'string') {
        throw new Error('Invalid paymaster contract address');
      }

      const userOp = params[0];

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

      const userOpHash = this.getUserOpHash(userOp, paymasterAndDataWithOutSignature, 11155111);

      const signature = await this.signer.signMessage(
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
          "paymaster": this.paymasterContract.target,
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
    params: any[]
  ): Promise<any> {
    try {
      // Extract userOp from params
      const userOp = params[0];

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
      console.log('### paymasterAndDataWithOutSignature: \n', paymasterAndDataWithOutSignature);

      // Create hash to sign
      const userOpHash = this.getUserOpHash(userOp, paymasterAndDataWithOutSignature, 11155111);
      console.log("userOpHash", userOpHash);

      // Sign the data
      const signature = await this.signer.signMessage(
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
      console.log("### paymaster: \n", this.paymasterContract.target);
      console.log("### paymasterData: \n", paymasterData);
      console.log("### signature: \n", signature);

      const paymasterAndData = {
        "id": id,
        "result": {
          "paymaster": this.paymasterContract.target,
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

  public async getUserOperationGasPrice(): Promise<any> {
    try {
      // Get the current gas price
      const feeData = await this.provider.getFeeData();

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
        "id": 2,
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