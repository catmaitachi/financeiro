import type { McpConnectionKit } from '../../../../shared/api.ts'

const SERVER_NAME = 'financeiro'

/** Monta os textos que o botão "Copiar para o agente" entrega. Função pura: o token nunca é montado no navegador. */
export function buildConnectionKit({ url, token }: { url: string; token: string }): McpConnectionKit {
  const header = `Authorization: Bearer ${token}`
  const claudeCodeCommand = `claude mcp add --transport http ${SERVER_NAME} ${url} --header "${header}"`

  const jsonConfig = JSON.stringify(
    { mcpServers: { [SERVER_NAME]: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  )

  const agentPrompt = [
    'Conecte-se ao meu servidor MCP do Financeiro: são os meus dados financeiros pessoais, guardados no meu computador.',
    '',
    '- Transporte: HTTP (Streamable HTTP)',
    `- URL: ${url}`,
    `- Cabeçalho: ${header}`,
    '',
    `Se você for o Claude Code, rode: ${claudeCodeCommand}`,
    'Em outros agentes, adicione um servidor MCP remoto com a URL e o cabeçalho acima.',
    '',
    'Depois de conectar, liste as ferramentas disponíveis e me diga o que consegue fazer.',
    '',
    'Combinados:',
    '- Os valores vêm em centavos inteiros (R$ 12,34 = 1234), em reais (BRL).',
    '- As ferramentas que alteram dados só aparecem se eu liberar a escrita no app. Peça a minha confirmação antes de qualquer alteração.',
    '- O token é segredo: não o repita nas respostas nem o grave em arquivos que vão para o Git.',
  ].join('\n')

  return { url, token, claudeCodeCommand, jsonConfig, agentPrompt }
}
