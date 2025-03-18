import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import { PaymasterService } from '../services/paymaster.js';
import { paymasterConfig } from '../config/paymaster.js';

/**
 * Plugin to register the PaymasterService
 */
const paymasterPlugin: FastifyPluginAsync = async (fastify, options) => {
  // Initialize the PaymasterService
  const paymasterService = new PaymasterService(paymasterConfig);
  
  // Register the service as a decorator
  fastify.decorate('paymaster', paymasterService);
  // Log that the service is ready
  fastify.log.info('Paymaster service initialized');
};

export default fp(paymasterPlugin);

// Add TypeScript declaration for the fastify instance
declare module 'fastify' {
  interface FastifyInstance {
    paymaster: PaymasterService;
  }
} 