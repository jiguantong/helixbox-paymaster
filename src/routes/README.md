Paymaster 讨论

之前的方案:
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

计划方案:

Bundler 使用pimlico 开源的 alto
需求：Bera Chain

接口：
eth_estimateUserOperationGas
	估计UserOp执行所需的gas数量
pimlico_getUserOperationGasPrice
	估计UserOp执行时的Gas Price(价格)

// 以下接口需要实现
pm_getPaymasterStubData
	https://docs.alchemy.com/reference/pm_getpaymasterstubdata
	用于获取初步的 paymaster 数据，以便进行 gas 估算

pm_validateSponsorshipPolicies
	验证用户操作是否符合赞助政策

pm_getPaymasterData
	获取最终的 paymaster 数据，包含签名等

eth_sendUserOperation
	发送用户操作到 bundler

eth_getUserOperationReceipt
	获取用户操作的收据

// 流程优化
1. 前端构建基本 UserOp
2. 调用 pm_getPaymasterStubData 获取初步 paymaster 数据
3. 使用 eth_estimateUserOperationGas 估算 gas
4. 使用 pimlico_getUserOperationGasPrice 获取 gas 价格
5. 计算并显示费用给用户确认
6. 用户确认后，调用 pm_getPaymasterData 获取最终 paymaster 数据（包含签名）
7. 发送完整 UserOp 到 bundler
8. 监控交易状态并获取收据
