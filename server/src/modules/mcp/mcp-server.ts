/** Único arquivo do módulo que conhece o SDK do MCP: o restante só define ferramentas. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { ForecastExpressionError } from '../../../../shared/forecast-expression.ts'
import { AppError } from '../../platform/http/errors.ts'
import type { Logger } from '../../platform/logger.ts'
import { ProviderError } from '../provider/provider.ts'
import type { McpTool } from './tool.ts'

const SERVER_INFO = { name: 'financeiro', version: '0.1.0' }

const INSTRUCTIONS =
  'Dados financeiros pessoais do titular, guardados no próprio computador. Valores em centavos inteiros (BRL) e datas no fuso de São Paulo. ' +
  'Comece por resumo_do_mes ou listar_contas e aprofunde com listar_transacoes.'

export function buildMcpServer(tools: McpTool[], logger: Logger): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS })

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { title: tool.title, ...tool.annotations },
      },
      async (input: unknown): Promise<CallToolResult> => {
        try {
          const result = await tool.run(input)
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result as Record<string, unknown>,
          }
        } catch (error) {
          return failure(tool.name, error, logger)
        }
      },
    )
  }

  return server
}

/**
 * Atende uma requisição HTTP do MCP. Sem sessão: cada chamada monta o seu
 * servidor, então a lista de ferramentas sempre reflete o interruptor de
 * escrita do momento.
 */
export async function handleMcpRequest(request: Request, tools: McpTool[], logger: Logger): Promise<Response> {
  const server = buildMcpServer(tools, logger)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    await server.close()
  }
}

/** Erros de domínio viram texto útil para o agente; o resto não vaza detalhe interno. */
function failure(tool: string, error: unknown, logger: Logger): CallToolResult {
  if (error instanceof AppError || error instanceof ForecastExpressionError || error instanceof ProviderError) {
    return { isError: true, content: [{ type: 'text', text: error.message }] }
  }
  logger.error('Erro não tratado em ferramenta do MCP.', {
    tool,
    reason: error instanceof Error ? error.message : String(error),
  })
  return { isError: true, content: [{ type: 'text', text: 'Algo deu errado aqui dentro. Tente de novo.' }] }
}
