Paymaster 讨论
前端获取 UserOps
查询 Policies
输入：UserOps
输出：Policy 和估算的手续费（使用 Pimlico 的 `getUserOperationGasPrice` API）
前端确认 Policy 和手续费
显示手续费 {token} 给用户确认
如果是 ERC20，在发送 UserOps 之前，添加一个 approve ERC20 的 UserOp
发送 UserOp
使用 Pimlico 的 `sendUserOperation`
// paymasterContext: {
//   token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
// }
Bundler 使用公开的
需求：Bera Chain

接口：
eth_estimateUserOperationGas
	估计UserOp执行所需的gas数量
pimlico_getUserOperationGasPrice
	估计UserOp执行时的Gas Price(价格)



TODO: pm_getPaymasterStubData
	https://docs.alchemy.com/reference/pm_getpaymasterstubdata

	模拟UserOp
pm_validateSponsorshipPolicies

TODO: pm_getPaymasterData

eth_sendUserOperation

eth_getUserOperationReceipt
