import { UserOperation } from '../types/userOperation.js';
import { ethers } from 'ethers';

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

  /**
   * Get preliminary paymaster data for gas estimation
   */
  async getPaymasterStubData(
    id: number,
    params: any[] // [{"callData":"0x541d63c8000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000021234000000000000000000000000000000000000000000000000000000000000","maxFeePerGas":"0x3e4f9bc6","maxPriorityFeePerGas":"0x12dd2c","nonce":"0x195a89bac4d0000000000000000","sender":"0x2c01A42371dDa22fE7731601F712f963BD4c3B38","signature":"0x000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","callGasLimit":"0x0","verificationGasLimit":"0x0","preVerificationGas":"0x0"},"0x0000000071727De22E5E9d8BAf0edAc6f37da032","0xaa36a7",null]
  ): Promise<any> {
    try {
      // Ensure paymaster address is valid
      if (!this.paymasterContract.target || typeof this.paymasterContract.target !== 'string') {
        throw new Error('Invalid paymaster contract address');
      }

      // Extract userOp from params
      const userOp = params[0];
      const entryPoint = params[1];
      const context = params[3] || {};

      // Process token address
      const tokenAddress = context?.token || ethers.ZeroAddress;
      // Ensure token address is 20 bytes
      const formattedTokenAddress = ethers.getAddress(tokenAddress);

      // Set validity time window
      const validUntil = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour
      const validAfter = Math.floor(Date.now() / 1000) - 60; // Valid from 1 minute ago

      console.log("targetAddress", this.paymasterContract.target);
      console.log("userOp sender", userOp.sender);
      console.log("entryPoint", entryPoint);

      // Create hash to sign
      const userOpHash = await this.getUserOpHash(userOp, entryPoint);
      console.log("userOpHash", userOpHash);
      // Prepare data for signature
      const dataToSign = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['bytes32', 'address', 'address', 'uint48', 'uint48'],
          [userOpHash, this.paymasterContract.target, formattedTokenAddress, validUntil, validAfter]
        )
      );
      console.log("dataToSign", dataToSign);

      // Sign the data
      const signature = await this.signer.signMessage(
        ethers.getBytes(dataToSign)
      );

      // Build paymaster data in the format expected by the client
      // pimlico demo: 0x00000000000000000000000000cd91f19f0f19ce862d7bec7b7d9b95457145afc6f639c28fd0360f488937bfa41e6eedcd3a46054fd95fcd0e3ef6b0bc0a615c4d975eef55c8a3517257904d5b1c
      const paymasterData = ethers.concat([
        formattedTokenAddress,
        ethers.zeroPadValue(ethers.toBeHex(validUntil), 32),
        ethers.zeroPadValue(ethers.toBeHex(validAfter), 32),
        ethers.getBytes(signature)
      ]);

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
        const postOpGas = 15000 + (callDataLength * 8); // Base cost + 8 gas per byte

        return {
          verificationGas: Math.min(verificationGas, 150000), // Set cap
          postOpGas: Math.min(postOpGas, 50000) // Set cap
        };
      };

      const gasLimits = calculateGasLimits(userOp);
      const stubData = {
        "id": id,
        "result": {
          "paymaster": this.paymasterContract.target,
          "paymasterData": paymasterData,
          "paymasterPostOpGasLimit": `0x${gasLimits.postOpGas.toString(16)}`,
          "paymasterVerificationGasLimit": `0x${gasLimits.verificationGas.toString(16)}`
        },
        "jsonrpc": "2.0"
      }
      console.log("stubData", stubData);
      return stubData;
    } catch (error: unknown) {
      console.error("Error in getPaymasterStubData:", error);
      throw new Error(`Failed to generate paymaster stub data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate if the user operation meets sponsorship policies
   */
  async validateSponsorshipPolicies(
    userOp: UserOperation,
    entryPoint: string,
    policies: any[]
  ): Promise<{
    isSponsored: boolean;
    reason?: string;
    sponsorshipInfo?: any;
  }> {
    try {
      // Implement policy validation logic here
      // Example: Check if user is in allowlist, if operation is allowed, etc.

      // For demonstration, we'll implement a simple check
      const isAllowedSender = await this.checkIfSenderIsAllowed(userOp.sender);
      const isAllowedOperation = await this.validateOperation(userOp);

      if (!isAllowedSender) {
        return {
          isSponsored: false,
          reason: "Sender address is not allowed for sponsorship"
        };
      }

      if (!isAllowedOperation) {
        return {
          isSponsored: false,
          reason: "Operation type is not eligible for sponsorship"
        };
      }

      // Calculate estimated gas costs
      const gasEstimation = await this.estimateGasCosts(userOp, entryPoint);

      return {
        isSponsored: true,
        sponsorshipInfo: {
          estimatedGasCost: gasEstimation.totalCost,
          estimatedGas: gasEstimation.totalGas,
          policies: policies.filter(p => p.isApplicable)
        }
      };
    } catch (error: unknown) {
      console.error("Error in validateSponsorshipPolicies:", error);
      throw new Error(`Failed to validate sponsorship policies: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get final paymaster data with signature
   */
  async getPaymasterData(
    userOp: UserOperation,
    entryPoint: string,
    context?: { token?: string }
  ): Promise<string> {
    try {
      const tokenAddress = context?.token || ethers.ZeroAddress;

      // Set validity window
      const validUntil = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour
      const validAfter = Math.floor(Date.now() / 1000) - 60; // Valid from 1 minute ago

      // Create hash to sign
      const userOpHash = await this.getUserOpHash(userOp, entryPoint);

      // Prepare data for signature
      const dataToSign = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['bytes32', 'address', 'address', 'uint48', 'uint48'],
          [userOpHash, this.paymasterContract.target, tokenAddress, validUntil, validAfter]
        )
      );

      // Sign the data
      const signature = await this.signer.signMessage(
        ethers.getBytes(dataToSign)
      );

      // Format final paymaster data
      const paymasterAndData = ethers.concat([
        this.paymasterContract.target as string,
        tokenAddress,
        ethers.zeroPadValue(ethers.toBeHex(validUntil), 32),
        ethers.zeroPadValue(ethers.toBeHex(validAfter), 32),
        ethers.getBytes(signature)
      ]);

      return paymasterAndData;
    } catch (error: unknown) {
      console.error("Error in getPaymasterData:", error);
      throw new Error(`Failed to generate paymaster data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Helper methods
  private async checkIfSenderIsAllowed(sender: string): Promise<boolean> {
    // Implement your logic to check if sender is allowed
    // This could be a database check, contract call, etc.
    return true; // For demonstration
  }

  private async validateOperation(userOp: UserOperation): Promise<boolean> {
    // Implement your logic to validate the operation
    // Check callData to determine what operation is being performed
    return true; // For demonstration
  }

  private async estimateGasCosts(userOp: UserOperation, entryPoint: string): Promise<{
    totalGas: string;
    totalCost: string;
  }> {
    // Implement gas estimation logic
    // This could call eth_estimateUserOperationGas or do custom calculations
    return {
      totalGas: "1000000",
      totalCost: "0.0001" // In ETH
    };
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
            "maxFeePerGas": `0x${(baseFee + fastMaxPriorityFee).toString(16)}`,
            "maxPriorityFeePerGas": `0x${fastMaxPriorityFee.toString(16)}`
          },
          "slow": {
            "maxFeePerGas": `0x${(baseFee + slowMaxPriorityFee).toString(16)}`,
            "maxPriorityFeePerGas": `0x${slowMaxPriorityFee.toString(16)}`
          },
          "standard": {
            "maxFeePerGas": `0x${(baseFee + standardMaxPriorityFee).toString(16)}`,
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

  private async getUserOpHash(userOp: UserOperation, entryPoint: string): Promise<string> {
    // Implement the userOp hash calculation according to ERC-4337 spec
    const packedUserOp = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        'address', // sender
        'uint256', // nonce
        'bytes32', // initCode hash
        'bytes32', // callData hash
        'uint256', // callGasLimit
        'uint256', // verificationGasLimit
        'uint256', // preVerificationGas
        'uint256', // maxFeePerGas
        'uint256', // maxPriorityFeePerGas
        'bytes32', // paymasterAndData hash
      ],
      [
        userOp.sender,
        userOp.nonce,
        ethers.keccak256(userOp.initCode || '0x'),
        ethers.keccak256(userOp.callData || '0x'),
        userOp.callGasLimit,
        userOp.verificationGasLimit,
        userOp.preVerificationGas,
        userOp.maxFeePerGas,
        userOp.maxPriorityFeePerGas,
        ethers.keccak256(userOp.paymasterAndData || '0x'),
      ]
    );

    const userOpHash = ethers.keccak256(packedUserOp);

    // Combine with entryPoint and chainId
    const network = await this.provider.getNetwork();
    const chainId = network.chainId;
    const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'uint256'],
      [userOpHash, entryPoint, chainId]
    );

    return ethers.keccak256(encodedData);
  }
} 