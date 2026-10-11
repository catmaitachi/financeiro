/** Traduz o estado técnico de um Item da Pluggy em algo que a pessoa consegue resolver. */
import type { ConnectionHealth } from '../../../../shared/api.ts'

const RECONNECT: Record<string, string> = {
  INVALID_CREDENTIALS: 'A instituição recusou o login. Reconecte informando os dados de acesso atuais.',
  ACCOUNT_CREDENTIALS_RESET: 'A instituição pediu que você redefina sua senha. Depois disso, reconecte.',
  USER_AUTHORIZATION_REVOKED: 'O consentimento de compartilhamento foi revogado. Reconecte para autorizar de novo.',
  USER_AUTHORIZATION_NOT_GRANTED: 'A autorização no aplicativo da instituição não foi concluída. Reconecte e autorize.',
}

const MFA: Record<string, string> = {
  INVALID_CREDENTIALS_MFA: 'O código de confirmação estava incorreto ou expirou. Reconecte e informe um novo.',
  USER_INPUT_TIMEOUT: 'O tempo para informar o código de confirmação acabou. Reconecte e tente de novo.',
}

const USER_SIDE: Record<string, string> = {
  ACCOUNT_LOCKED: 'A conta está bloqueada na instituição. Desbloqueie por lá e depois atualize aqui.',
  ACCOUNT_NEEDS_ACTION: 'A instituição exige uma ação sua, como aceitar novos termos. Resolva por lá e atualize aqui.',
  ALREADY_LOGGED_IN: 'Há uma sessão aberta em outro lugar. Saia dela e atualize aqui.',
  USER_NOT_SUPPORTED: 'A Pluggy não oferece suporte a este tipo de conta nesta instituição.',
}

const RETRY_LATER: Record<string, string> = {
  SITE_NOT_AVAILABLE: 'O site da instituição está fora do ar ou em manutenção. Tente atualizar mais tarde.',
  CONNECTION_ERROR: 'Não foi possível conectar à instituição. Tente atualizar mais tarde.',
  ERROR: 'A coleta de dados falhou por um erro inesperado. Tente atualizar de novo.',
  MERGE_ERROR: 'Os dados foram coletados, mas a Pluggy não conseguiu gravá-los. Tente atualizar de novo.',
}

/** Produtos que falharam em uma coleta parcial, lidos de `statusDetail`. */
function failedProducts(statusDetail: unknown): string[] {
  if (!statusDetail || typeof statusDetail !== 'object') return []
  const labels: Record<string, string> = {
    accounts: 'contas',
    creditCards: 'cartões',
    transactions: 'transações',
    investments: 'investimentos',
    identity: 'dados cadastrais',
  }
  return Object.entries(statusDetail as Record<string, unknown>)
    .filter(([, value]) => value && typeof value === 'object' && (value as { isUpdated?: boolean }).isUpdated === false)
    .map(([key]) => labels[key] ?? key)
}

export function connectionHealth(item: {
  status: string
  executionStatus: string | null
  statusDetail: unknown
}): ConnectionHealth {
  const execution = item.executionStatus ?? ''

  if (item.status === 'UPDATING') {
    if (execution === 'USER_AUTHORIZATION_PENDING') {
      return {
        level: 'attention',
        action: 'wait',
        title: 'Aguardando sua autorização',
        detail: 'Autorize o acesso no aplicativo da instituição. A coleta continua sozinha em seguida.',
      }
    }
    return { level: 'updating', action: 'wait', title: 'Atualizando', detail: 'A instituição está enviando os dados.' }
  }

  if (item.status === 'WAITING_USER_INPUT' || execution === 'WAITING_USER_INPUT') {
    return {
      level: 'attention',
      action: 'mfa',
      title: 'Aguardando sua confirmação',
      detail: 'A conexão espera uma autorização ou um código seu. Abra para concluir.',
    }
  }

  if (item.status === 'LOGIN_ERROR' || execution in RECONNECT) {
    return {
      level: 'error',
      action: 'reconnect',
      title: 'Acesso recusado',
      detail: RECONNECT[execution] ?? RECONNECT.INVALID_CREDENTIALS!,
    }
  }

  if (execution in MFA) {
    return { level: 'error', action: 'mfa', title: 'Confirmação não concluída', detail: MFA[execution]! }
  }
  if (execution in USER_SIDE) {
    return { level: 'error', action: 'retry', title: 'A instituição exige uma ação', detail: USER_SIDE[execution]! }
  }

  if (item.status === 'OUTDATED') {
    return {
      level: 'error',
      action: 'retry',
      title: 'Dados desatualizados',
      detail: RETRY_LATER[execution] ?? RETRY_LATER.ERROR!,
    }
  }

  if (execution === 'PARTIAL_SUCCESS') {
    const failed = failedProducts(item.statusDetail)
    return {
      level: 'attention',
      action: 'retry',
      title: 'Sincronização parcial',
      detail: failed.length
        ? `A instituição não entregou: ${failed.join(', ')}. O restante está atualizado.`
        : 'A instituição entregou só parte dos dados. O restante está atualizado.',
    }
  }

  return { level: 'ok', action: 'none', title: 'Em dia', detail: null }
}
