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
    userOp: UserOperation,
    entryPoint: string,
    context?: { token?: string }
  ): Promise<string> {
    try {
      // Generate stub paymaster data for gas estimation
      // This is a simplified version without signatures
      const tokenAddress = context?.token || ethers.ZeroAddress;
      
      // Format: paymasterAddress + tokenAddress + validUntil + validAfter
      const validUntil = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour
      const validAfter = Math.floor(Date.now() / 1000) - 60; // Valid from 1 minute ago
      
      const paymasterAndData = ethers.concat([
        this.paymasterContract.target as string,
        tokenAddress,
        ethers.zeroPadValue(ethers.toBeHex(validUntil), 32),
        ethers.zeroPadValue(ethers.toBeHex(validAfter), 32),
        "0x" + "00".repeat(65) // Empty signature for stub
      ]);
      
      return paymasterAndData;
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

  private async getUserOpHash(userOp: UserOperation, entryPoint: string): Promise<string> {
    // Implement the userOp hash calculation according to ERC-4337 spec
    // This is a simplified version
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
      ],
      [
        userOp.sender,
        userOp.nonce,
        ethers.keccak256(userOp.initCode),
        ethers.keccak256(userOp.callData),
        userOp.callGasLimit,
        userOp.verificationGasLimit,
        userOp.preVerificationGas,
        userOp.maxFeePerGas,
        userOp.maxPriorityFeePerGas,
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