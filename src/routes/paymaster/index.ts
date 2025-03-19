import { FastifyPluginAsync } from 'fastify'
import { UserOperation } from '../../types/userOperation.js'
import { PaymasterService } from '../../services/paymasterService.js'
import config from '../../config/index.js'

const paymaster: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  // Initialize PaymasterService
  const paymasterService = new PaymasterService(config)

  // Health check endpoint
  fastify.post('/', { schema: pimlicoSchema }, async function (request, reply) {
    const { id, method, params } = request.body as {
      id: number,
      method: string,
      params: any[]
    }

    switch(method) {
      case 'pimlico_getUserOperationGasPrice': 
        return await paymasterService.getUserOperationGasPrice();
      case 'pm_getPaymasterStubData':
        return await paymasterService.getPaymasterStubData(id, params)
      case 'pm_validateSponsorshipPolicies':
        return await paymasterService.validateSponsorshipPolicies(params[0], params[1], params[2])
      case 'pm_getPaymasterData':
        return await paymasterService.getPaymasterData(id, params)
      default:
        return reply.code(400).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Invalid method'
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

}

export default paymaster

const pimlicoSchema = {
  body: {
    type: 'object',
    properties: {
      id: { type: 'number', default: 1 },
      jsonrpc: { type: 'string', default: '2.0' },
      method: { type: 'string' },
      params: { type: 'array' },
    },
    required: ['method', 'params'],
  },
}
