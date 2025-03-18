import { FastifyPluginAsync } from 'fastify'
import { UserOperation } from '../../types/userOperation.js'
import { PaymasterService } from '../../services/paymasterService.js'
import config from '../../config/index.js'

const paymaster: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Initialize PaymasterService
  const paymasterService = new PaymasterService(config)

  // Health check endpoint
  fastify.get('/', async function (request, reply) {
    return { status: 'healthy', service: 'paymaster' }
  })

  // pm_getPaymasterStubData endpoint
  fastify.post('/getPaymasterStubData', async function (request, reply) {
    const { userOp, entryPoint, context } = request.body as {
      userOp: UserOperation,
      entryPoint: string,
      context?: {
        token?: string
      }
    }

    try {
      const stubData = await paymasterService.getPaymasterStubData(userOp, entryPoint, context)
      return {
        jsonrpc: '2.0',
        result: stubData,
        id: 1
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      fastify.log.error(`Error in getPaymasterStubData: ${errorMessage}`)
      return reply.code(400).send({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: errorMessage
        },
        id: 1
      })
    }
  })

  // pm_validateSponsorshipPolicies endpoint
  fastify.post('/validateSponsorshipPolicies', async function (request, reply) {
    const { userOp, entryPoint, policies } = request.body as {
      userOp: UserOperation,
      entryPoint: string,
      policies: any[]
    }

    try {
      const validationResult = await paymasterService.validateSponsorshipPolicies(userOp, entryPoint, policies)
      return {
        jsonrpc: '2.0',
        result: validationResult,
        id: 1
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      fastify.log.error(`Error in validateSponsorshipPolicies: ${errorMessage}`)
      return reply.code(400).send({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: errorMessage
        },
        id: 1
      })
    }
  })

  // pm_getPaymasterData endpoint
  fastify.post('/getPaymasterData', async function (request, reply) {
    const { userOp, entryPoint, context } = request.body as {
      userOp: UserOperation,
      entryPoint: string,
      context?: {
        token?: string
      }
    }

    try {
      const paymasterData = await paymasterService.getPaymasterData(userOp, entryPoint, context)
      return {
        jsonrpc: '2.0',
        result: paymasterData,
        id: 1
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      fastify.log.error(`Error in getPaymasterData: ${errorMessage}`)
      return reply.code(400).send({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: errorMessage
        },
        id: 1
      })
    }
  })
}

export default paymaster
