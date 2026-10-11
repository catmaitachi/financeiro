import type { McpPorts } from './ports.ts'
import { readTools } from './read-tools.ts'
import type { McpTool } from './tool.ts'
import { writeTools } from './write-tools.ts'

/** Ferramentas que o agente enxerga agora. As que alteram dados só aparecem com a escrita liberada. */
export function mcpTools(ports: McpPorts, options: { write: boolean }): McpTool[] {
  return options.write ? [...readTools(ports), ...writeTools(ports)] : readTools(ports)
}
