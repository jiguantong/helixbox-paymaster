import { FastifyPluginAsync } from "fastify"
import { UserOperation } from '../../types/userOperation.js'

// Renamed the example route to paymaster
const paymaster: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Basic health check endpoint
  fastify.get('/', async function (request, reply) {
    return { status: 'Paymaster API is running' }
  })

  // Endpoint to sponsor user operations
  fastify.post('/sponsor', async function (request, reply) {
    try {
      const { userOperation, entryPoint, chainId } = request.body as {
        userOperation: UserOperation;
        entryPoint: string;
        chainId: number;
      }
      
      // Validate the request
      if (!userOperation || !entryPoint || !chainId) {
        return reply.code(400).send({ 
          error: 'Missing required parameters' 
        })
      }

      // Check if chain is supported
      if (!fastify.paymaster.isChainSupported(chainId)) {
        return reply.code(400).send({
          error: `Chain ID ${chainId} is not supported`
        })
      }

      // Sponsor the user operation
      const sponsoredUserOp = await fastify.paymaster.sponsorUserOperation(
        userOperation,
        entryPoint,
        chainId
      )

      return { 
        status: 'success',
        userOperation: sponsoredUserOp
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ 
        error: 'Failed to sponsor operation',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Endpoint to get paymaster and data for a user operation
  fastify.post('/paymasterAndData', async function (request, reply) {
    try {
      const { userOperation, entryPoint, chainId } = request.body as {
        userOperation: UserOperation;
        entryPoint: string;
        chainId: number;
      }
      
      // Validate the request
      if (!userOperation || !entryPoint || !chainId) {
        return reply.code(400).send({ 
          error: 'Missing required parameters' 
        })
      }

      // Check if chain is supported
      if (!fastify.paymaster.isChainSupported(chainId)) {
        return reply.code(400).send({
          error: `Chain ID ${chainId} is not supported`
        })
      }

      // Generate paymasterAndData
      const paymasterAndData = await fastify.paymaster.generatePaymasterAndData(
        userOperation,
        entryPoint,
        chainId
      )

      return { paymasterAndData }
    } catch (error) {
      fastify.log.error(error)
      return reply.code(500).send({ 
        error: 'Failed to generate paymasterAndData',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })
}

export default paymaster;
