import type { z } from 'zod'

export interface McpToolAnnotations {
  /** A ferramenta só consulta. Os clientes costumam rodar sem pedir confirmação. */
  readOnlyHint: boolean
  /** A alteração pode apagar ou sobrescrever dados. */
  destructiveHint?: boolean
  /** Repetir a chamada com os mesmos argumentos não muda mais nada. */
  idempotentHint?: boolean
}

/**
 * Uma operação que o agente pode chamar. Não conhece o SDK do MCP nem o HTTP:
 * quem registra as ferramentas num servidor é o `mcp-server.ts`.
 */
export interface McpTool {
  name: string
  title: string
  description: string
  inputSchema: z.ZodObject
  annotations: McpToolAnnotations
  /** Recebe a entrada já validada pelo `inputSchema` e devolve um objeto serializável em JSON. */
  run(input: unknown): unknown | Promise<unknown>
}

/** Mantém `run` tipado pelo schema e apaga o tipo só na fronteira da lista de ferramentas. */
export function defineTool<S extends z.ZodObject>(tool: {
  name: string
  title: string
  description: string
  inputSchema: S
  annotations: McpToolAnnotations
  run(input: z.infer<S>): unknown | Promise<unknown>
}): McpTool {
  return { ...tool, run: (input) => tool.run(input as z.infer<S>) }
}
