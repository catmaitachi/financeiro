import type { Container } from '../../container.ts'

/**
 * Tudo o que as ferramentas do MCP enxergam do restante do sistema. Listar
 * aqui, em vez de receber o `Container` inteiro, mantém o módulo sem acesso a
 * credenciais, configurações e demais peças que o agente não deve alcançar.
 */
export type McpPorts = Pick<
  Container,
  'ledger' | 'dashboard' | 'forecasts' | 'reconciliation' | 'sync' | 'connections' | 'clock'
>
