import { spawn } from 'node:child_process'

export interface CommandResult {
  code: number
  stdout: string
}

/**
 * Executa um utilitário do sistema sem shell. O que for sensível vai pela
 * entrada padrão, nunca nos argumentos: assim não aparece na lista de processos.
 */
export type CommandRunner = (file: string, args: string[], stdin?: string) => Promise<CommandResult>

export const runCommand: CommandRunner = (file, args, stdin = '') =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
    let stdout = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stdout }))
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
  })
