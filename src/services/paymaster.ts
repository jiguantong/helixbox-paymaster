import { ethers } from 'ethers'
import { UserOperation } from '../types/userOperation.js'

// Interface for paymaster configuration
export interface PaymasterConfig {
  privateKey: string;
  contractAddress: string;
  entryPoints: Record<string, string>;
  supportedChains: number[];
  rpcUrls: Record<number, string>;
}

/**
 * Service to handle paymaster operations
 */
export class PaymasterService {
  private config: PaymasterConfig;
  private providers: Record<number, ethers.JsonRpcProvider> = {};
  private wallets: Record<number, ethers.Wallet> = {};

  constructor(config: PaymasterConfig) {
    this.config = config;
    this.initializeProviders();
  }

  /**
   * Initialize providers and wallets for all supported chains
   */
  private initializeProviders(): void {
    for (const chainId of this.config.supportedChains) {
      if (!this.config.rpcUrls[chainId]) {
        throw new Error(`No RPC URL configured for chain ID ${chainId}`);
      }
      
      const provider = new ethers.JsonRpcProvider(this.config.rpcUrls[chainId]);
      this.providers[chainId] = provider;
      this.wallets[chainId] = new ethers.Wallet(this.config.privateKey, provider);
    }
  }

  /**
   * Validate if the chain is supported
   */
  public isChainSupported(chainId: number): boolean {
    return this.config.supportedChains.includes(chainId);
  }

  /**
   * Generate paymasterAndData for a user operation
   */
  public async generatePaymasterAndData(
    userOp: UserOperation,
    entryPoint: string,
    chainId: number
  ): Promise<string> {
    // Validate chain support
    if (!this.isChainSupported(chainId)) {
      throw new Error(`Chain ID ${chainId} is not supported`);
    }

    // Get the wallet for the current chain
    const wallet = this.wallets[chainId];
    if (!wallet) {
      throw new Error(`No wallet configured for chain ID ${chainId}`);
    }

    // Validate entry point
    if (!this.config.entryPoints[entryPoint]) {
      throw new Error(`EntryPoint ${entryPoint} is not supported`);
    }

    // Set validity timestamps (1 hour from now)
    const validUntil = Math.floor(Date.now() / 1000) + 3600;
    const validAfter = 0; // Valid immediately

    // Create a hash of the user operation to sign
    // First create a userOp with our paymaster address and validity timestamps
    const tempPaymasterAndData = ethers.concat([
      this.config.contractAddress,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint48', 'uint48', 'bytes'],
        [validUntil, validAfter, '0x']
      )
    ]);

    // Create a temporary userOp with our paymaster data
    const tempUserOp = {
      ...userOp,
      paymasterAndData: tempPaymasterAndData
    };

    // Calculate the user operation hash according to ERC-4337 spec
    const userOpHash = await this.calculateUserOpHash(tempUserOp, entryPoint, chainId);

    // Sign the hash
    const signature = await wallet.signMessage(ethers.getBytes(userOpHash));

    // Construct the final paymasterAndData
    return ethers.concat([
      this.config.contractAddress,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint48', 'uint48', 'bytes'],
        [validUntil, validAfter, signature]
      )
    ]);
  }

  /**
   * Calculate the EIP-4337 userOpHash
   */
  private async calculateUserOpHash(
    userOp: UserOperation,
    entryPoint: string,
    chainId: number
  ): Promise<string> {
    // Get the provider for the current chain
    const provider = this.providers[chainId];
    if (!provider) {
      throw new Error(`No provider configured for chain ID ${chainId}`);
    }

    // Get the chain ID from the provider to ensure accuracy
    const networkChainId = (await provider.getNetwork()).chainId;

    // Pack the user operation
    const packedUserOp = this.packUserOp(userOp);

    // Calculate the userOpHash according to ERC-4337 spec
    const encodedUserOp = ethers.keccak256(packedUserOp);
    
    // Encode the full message to be signed
    const encodedMessage = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'uint256'],
      [encodedUserOp, entryPoint, networkChainId]
    );

    // Return the keccak256 hash of the encoded message
    return ethers.keccak256(encodedMessage);
  }

  /**
   * Pack a user operation into bytes according to ERC-4337 spec
   */
  private packUserOp(userOp: UserOperation): string {
    // Pack the user operation according to the ERC-4337 spec
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    
    const packedInitCode = ethers.keccak256(userOp.initCode);
    const packedCallData = ethers.keccak256(userOp.callData);
    const packedPaymasterAndData = ethers.keccak256(userOp.paymasterAndData);
    
    return ethers.concat([
      abiCoder.encode(
        [
          'address', // sender
          'uint256', // nonce
          'bytes32', // initCode
          'bytes32', // callData
          'uint256', // callGasLimit
          'uint256', // verificationGasLimit
          'uint256', // preVerificationGas
          'uint256', // maxFeePerGas
          'uint256', // maxPriorityFeePerGas
          'bytes32'  // paymasterAndData
        ],
        [
          userOp.sender,
          userOp.nonce,
          packedInitCode,
          packedCallData,
          userOp.callGasLimit,
          userOp.verificationGasLimit,
          userOp.preVerificationGas,
          userOp.maxFeePerGas,
          userOp.maxPriorityFeePerGas,
          packedPaymasterAndData
        ]
      )
    ]);
  }

  /**
   * Sponsor a user operation by signing it
   */
  public async sponsorUserOperation(
    userOp: UserOperation,
    entryPoint: string,
    chainId: number
  ): Promise<UserOperation> {
    // Validate chain support
    if (!this.isChainSupported(chainId)) {
      throw new Error(`Chain ID ${chainId} is not supported`);
    }

    // Apply sponsorship policy
    await this.applySponsorshipPolicy(userOp, entryPoint, chainId);

    // Estimate gas for the operation
    const estimatedGas = await this.estimateUserOperationGas(userOp, entryPoint, chainId);
    
    // Update gas parameters if they're too low
    const updatedUserOp = this.updateGasParameters(userOp, estimatedGas);

    // Generate paymasterAndData
    const paymasterAndData = await this.generatePaymasterAndData(
      updatedUserOp,
      entryPoint,
      chainId
    );

    // Return the updated user operation with paymasterAndData
    return {
      ...updatedUserOp,
      paymasterAndData
    };
  }

  /**
   * Apply sponsorship policy to determine if the operation should be sponsored
   */
  private async applySponsorshipPolicy(
    userOp: UserOperation,
    entryPoint: string,
    chainId: number
  ): Promise<void> {
    // Check if the sender is in the whitelist
    if (!await this.isSenderWhitelisted(userOp.sender, chainId)) {
      throw new Error(`Sender ${userOp.sender} is not whitelisted for sponsorship`);
    }
    
    // Check if the target contract is supported
    const targetContract = this.extractTargetContract(userOp);
    if (!await this.isContractSupported(targetContract, chainId)) {
      throw new Error(`Target contract ${targetContract} is not supported for sponsorship`);
    }
    
    // Check if the operation is within gas limits
    const gasLimit = BigInt(userOp.callGasLimit) + 
                    BigInt(userOp.verificationGasLimit) + 
                    BigInt(userOp.preVerificationGas);
                    
    const maxGasLimit = BigInt(1000000); // 1M gas units
    
    if (gasLimit > maxGasLimit) {
      throw new Error(`Gas limit exceeds maximum allowed (${maxGasLimit.toString()})`);
    }
    
    // Check if the sender has exceeded rate limits
    if (await this.hasExceededRateLimit(userOp.sender, chainId)) {
      throw new Error(`Sender ${userOp.sender} has exceeded rate limits`);
    }
    
    // Check if the operation type is supported (based on calldata)
    if (!this.isOperationTypeSupported(userOp)) {
      throw new Error(`Operation type is not supported for sponsorship`);
    }
  }

  /**
   * Check if a sender is whitelisted for sponsorship
   */
  private async isSenderWhitelisted(sender: string, chainId: number): Promise<boolean> {
    // TODO: Implement actual whitelist checking logic
    // This could be:
    // 1. An in-memory whitelist
    // 2. A database lookup
    // 3. A smart contract call to check membership
    // 4. An API call to an external service
    
    // For demonstration, we'll use a simple in-memory whitelist
    const whitelist: Record<number, string[]> = {
      1: [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222'
      ],
      5: [
        '0x3333333333333333333333333333333333333333',
        '0x4444444444444444444444444444444444444444'
      ],
      // Add more chains as needed
    };
    
    // If no whitelist is defined for this chain, default to allowing all
    if (!whitelist[chainId]) {
      return true;
    }
    
    // Check if the sender is in the whitelist (case-insensitive)
    return whitelist[chainId].some(
      address => address.toLowerCase() === sender.toLowerCase()
    );
  }

  /**
   * Extract the target contract from a user operation
   */
  private extractTargetContract(userOp: UserOperation): string {
    // If initCode is not empty, this is a contract deployment
    if (userOp.initCode && userOp.initCode !== '0x') {
      // For contract deployments, the target is the factory contract
      // We need to extract the factory address from the initCode
      // The first 20 bytes of the initCode are the factory address
      return userOp.initCode.substring(0, 42);
    }
    
    // For regular transactions, the target is the sender (the account contract)
    return userOp.sender;
  }

  /**
   * Check if a contract is supported for sponsorship
   */
  private async isContractSupported(contractAddress: string, chainId: number): Promise<boolean> {
    // TODO: Implement actual contract support checking logic
    // This could be:
    // 1. An in-memory list of supported contracts
    // 2. A database lookup
    // 3. A check against contract metadata (e.g., is it a known token contract?)
    
    // For demonstration, we'll use a simple in-memory list
    const supportedContracts: Record<number, string[]> = {
      1: [
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Mainnet
        '0xdAC17F958D2ee523a2206206994597C13D831ec7'  // USDT on Mainnet
      ],
      5: [
        '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', // EntryPoint on Goerli
        '0x0000000000000000000000000000000000000000'  // Allow all on Goerli for testing
      ],
      // Add more chains as needed
    };
    
    // If no supported contracts list is defined for this chain, default to allowing all
    if (!supportedContracts[chainId]) {
      return true;
    }
    
    // Special case: allow all contracts
    if (supportedContracts[chainId].includes('0x0000000000000000000000000000000000000000')) {
      return true;
    }
    
    // Check if the contract is in the supported list (case-insensitive)
    return supportedContracts[chainId].some(
      address => address.toLowerCase() === contractAddress.toLowerCase()
    );
  }

  /**
   * Check if a sender has exceeded rate limits
   */
  private async hasExceededRateLimit(sender: string, chainId: number): Promise<boolean> {
    // TODO: Implement actual rate limiting logic
    // This could be:
    // 1. An in-memory counter with expiration
    // 2. A Redis-based rate limiter
    // 3. A database query to count recent operations
    
    // For demonstration, we'll always return false (no rate limiting)
    return false;
  }

  /**
   * Check if the operation type is supported based on calldata
   */
  private isOperationTypeSupported(userOp: UserOperation): boolean {
    // TODO: Implement operation type checking logic
    // This could analyze the calldata to determine what kind of operation it is
    // For example, is it a token transfer, a swap, etc.
    
    // For demonstration, we'll always return true (all operation types supported)
    return true;
  }

  /**
   * Estimate gas for a user operation
   */
  private async estimateUserOperationGas(
    userOp: UserOperation,
    entryPoint: string,
    chainId: number
  ): Promise<{
    callGasLimit: bigint;
    verificationGasLimit: bigint;
    preVerificationGas: bigint;
  }> {
    // In a real implementation, you would call the EntryPoint contract's
    // estimateGas methods or use a bundler API to get accurate estimates
    
    // For now, we'll return some reasonable defaults or the existing values
    return {
      callGasLimit: BigInt(userOp.callGasLimit),
      verificationGasLimit: BigInt(userOp.verificationGasLimit || '100000'),
      preVerificationGas: BigInt(userOp.preVerificationGas || '21000')
    };
  }

  /**
   * Update gas parameters if they're too low
   */
  private updateGasParameters(
    userOp: UserOperation,
    estimatedGas: {
      callGasLimit: bigint;
      verificationGasLimit: bigint;
      preVerificationGas: bigint;
    }
  ): UserOperation {
    // Add a safety margin to the gas estimates (e.g., 10%)
    const safetyMargin = 110n; // 110%
    const divider = 100n;
    
    const callGasLimit = (estimatedGas.callGasLimit * safetyMargin) / divider;
    const verificationGasLimit = (estimatedGas.verificationGasLimit * safetyMargin) / divider;
    const preVerificationGas = (estimatedGas.preVerificationGas * safetyMargin) / divider;
    
    // Only update gas parameters if our estimates are higher than what was provided
    return {
      ...userOp,
      callGasLimit: BigInt(userOp.callGasLimit) > callGasLimit 
        ? userOp.callGasLimit 
        : callGasLimit.toString(),
      verificationGasLimit: BigInt(userOp.verificationGasLimit || '0') > verificationGasLimit 
        ? userOp.verificationGasLimit 
        : verificationGasLimit.toString(),
      preVerificationGas: BigInt(userOp.preVerificationGas || '0') > preVerificationGas 
        ? userOp.preVerificationGas 
        : preVerificationGas.toString()
    };
  }
} 