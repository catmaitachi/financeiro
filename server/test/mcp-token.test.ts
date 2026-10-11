import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { McpTokenService } from '../src/modules/mcp/mcp-token.ts'
import { KeychainSecretStore, MemorySecretStore, SAFE_SECRET } from '../src/modules/credentials/secret-store.ts'
import { MCP_LABELS, MemoryMcpTokenStore, VaultMcpTokenStore, mcpVaultService } from '../src/modules/mcp/token-store.ts'

describe('token do MCP', () => {
  it('gera um token na primeira leitura e devolve o mesmo nas seguintes', async () => {
    const service = new McpTokenService(new MemoryMcpTokenStore())

    const first = await service.current()
    assert.match(first, /^fin_[A-Za-z0-9_-]{43}$/)
    assert.equal(await service.current(), first)
  })

  it('leituras simultâneas na primeira vez não geram dois tokens', async () => {
    const service = new McpTokenService(new MemoryMcpTokenStore())
    const [a, b, c] = await Promise.all([service.current(), service.current(), service.current()])

    assert.equal(a, b)
    assert.equal(b, c)
  })

  it('reaproveita o token já guardado no cofre', async () => {
    const store = new MemoryMcpTokenStore()
    const first = await new McpTokenService(store).current()

    assert.equal(await new McpTokenService(store).current(), first)
  })

  it('aceita só o token certo', async () => {
    const service = new McpTokenService(new MemoryMcpTokenStore())
    const token = await service.current()

    assert.equal(await service.verify(token), true)
    assert.equal(await service.verify(`${token}x`), false)
    assert.equal(await service.verify(token.slice(0, -1)), false)
    assert.equal(await service.verify(''), false)
    assert.equal(await service.verify(null), false)
  })

  it('rotacionar invalida o token antigo', async () => {
    const service = new McpTokenService(new MemoryMcpTokenStore())
    const old = await service.current()
    const next = await service.rotate()

    assert.notEqual(next, old)
    assert.equal(await service.verify(old), false)
    assert.equal(await service.verify(next), true)
    assert.equal(await service.current(), next)
  })

  it('a prévia esconde o miolo do token', async () => {
    const service = new McpTokenService(new MemoryMcpTokenStore())
    const token = await service.current()
    const preview = await service.preview()

    assert.ok(preview.startsWith(token.slice(0, 8)))
    assert.ok(preview.endsWith(token.slice(-4)))
    assert.ok(!preview.includes(token))
  })

  it('o token gerado cabe no que o Keychain aceita gravar', async () => {
    const token = await new McpTokenService(new MemoryMcpTokenStore()).current()

    assert.match(token, SAFE_SECRET)
  })

  it('o cofre do Keychain monta sem recusar os próprios rótulos, com o serviço usado em produção e no mock', () => {
    // Não toca no Keychain: só o construtor valida serviço e rótulos. A partida do servidor depende disso.
    assert.doesNotThrow(() => new KeychainSecretStore(mcpVaultService('financeiro-pluggy'), MCP_LABELS))
    assert.doesNotThrow(() => new KeychainSecretStore(mcpVaultService('financeiro-pluggy-mock'), MCP_LABELS))
  })

  it('o token sobrevive ao reinício quando o cofre persiste', async () => {
    const vault = new MemorySecretStore()
    const first = await new McpTokenService(new VaultMcpTokenStore(vault)).current()

    assert.equal(await new McpTokenService(new VaultMcpTokenStore(vault)).current(), first)
    assert.equal((await vault.read()).clientSecret, first)
  })
})
