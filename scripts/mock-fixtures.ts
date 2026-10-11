/**
 * Valores fictícios do simulador local da Pluggy. Não são segredos: só são
 * aceitos por `scripts/mock-pluggy.ts`, que roda apenas nesta máquina.
 */
export const MOCK_CLIENT_ID = '0f5a1c2e-7b34-4d19-9a6e-3c8d2b1f4e70'
export const MOCK_CLIENT_SECRET = 'mock-secret-somente-local-2f9c81'

export const MOCK_ITEMS = {
  aurora: 'a1a1a1a1-1111-4111-8111-000000000001',
  solar: 'a1a1a1a1-1111-4111-8111-000000000002',
  litoral: 'a1a1a1a1-1111-4111-8111-000000000003',
} as const
