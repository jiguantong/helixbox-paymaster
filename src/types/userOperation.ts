/**
 * Represents an ERC-4337 UserOperation
 */
export interface UserOperation {
  sender: string;
  nonce: string;
  initCode: string;
  callData: string;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymasterAndData: string;
  signature: string;
}

/**
 * Represents a sponsored UserOperation response
 */
export interface SponsoredUserOperationResponse {
  userOperation: UserOperation;
  entryPoint: string;
  chainId: number;
} 