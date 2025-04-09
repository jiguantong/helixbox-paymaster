import { FastifyPluginAsync } from 'fastify'
import { PaymasterService } from '../../services/paymasterService.js'
import config from '../../config/index.js'

const paymaster: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  const paymasterService = new PaymasterService(config)

  fastify.post('/', { schema: pimlicoSchema }, async function (request, reply) {
    const { id, method, params } = request.body as {
      id: number,
      method: string,
      params: any[]
    }

    switch (method) {
      case 'pimlico_getUserOperationGasPrice':
        return await paymasterService.getUserOperationGasPrice();
      case 'pm_getPaymasterStubData':
        return await paymasterService.getPaymasterStubData(id, params)
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
