import dotenv from 'dotenv';
import { PaymasterConfig } from '../services/paymaster.js';
dotenv.config();

/**
 * Paymaster configuration
 */
export const paymasterConfig: PaymasterConfig = {
  privateKey: process.env.PAYMASTER_PRIVATE_KEY || '',
  contractAddress: process.env.PAYMASTER_CONTRACT_ADDRESS || '',
  entryPoints: {
    // Default EntryPoint contract address
    '0x0000000071727De22E5E9d8BAf0edAc6f37da032': 'Ethereum EntryPoint v0.7'
  },
  supportedChains: [
    1, // Ethereum Mainnet
    5, // Goerli
    137, // Polygon
    80001, // Mumbai
    // Add more chains as needed
  ],
  rpcUrls: {
    1: process.env.RPC_URL_MAINNET || '',
    5: process.env.RPC_URL_GOERLI || '',
    137: process.env.RPC_URL_POLYGON || '',
    80001: process.env.RPC_URL_MUMBAI || '',
    // Add more RPC URLs as needed
  }
};

/**
 * Validation and rate limiting configuration
 */
export const validationConfig = {
  maxGasLimit: 1000000,
  maxOperationsPerMinute: 100,
  // Add more validation rules as needed
}; 