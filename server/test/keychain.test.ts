import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openSecretStore } from '../src/modules/credentials/open-secret-store.ts'
import { KeychainSecretStore } from '../src/modules/credentials/keychain-secret-store.ts'

// Mexe no Keychain de verdade (com valores fictícios, em um serviço descartável),
// por isso só roda quando pedido: KEYCHAIN_TEST=1 npm test
const enabled = process.platform === 'darwin' && process.env.KEYCHAIN_TEST === '1'

describe('macOS Keychain', { skip: !enabled }, () => {
  it('grava, lê, substitui e remove sem deixar rastro', async () => {
    const store = new KeychainSecretStore(`financeiro-teste-${process.pid}`)
    try {
      assert.deepEqual(await store.read(), { clientId: null, clientSecret: null })

      await store.write({ clientId: 'id-ficticio-0001', clientSecret: 'segredo.ficticio_0001~+/=' })
      assert.deepEqual(await store.read(), { clientId: 'id-ficticio-0001', clientSecret: 'segredo.ficticio_0001~+/=' })

      await store.write({ clientId: 'id-ficticio-0002', clientSecret: 'segredo-ficticio-0002' })
      assert.deepEqual(await store.read(), { clientId: 'id-ficticio-0002', clientSecret: 'segredo-ficticio-0002' })
    } finally {
      await store.clear()
    }
    assert.deepEqual(await store.read(), { clientId: null, clientSecret: null })
    await store.clear()
  })

  it('recusa valores que quebrariam a citação do comando', async () => {
    const store = new KeychainSecretStore(`financeiro-teste-${process.pid}`)
    await assert.rejects(store.write({ clientId: 'ok', clientSecret: 'aspas"; delete-keychain' }))
    assert.throws(() => new KeychainSecretStore('nome com espaço'))
  })
})

// O mesmo ciclo no cofre que o sistema atual oferece (DPAPI no Windows, chaveiro no Linux).
describe('cofre do sistema', { skip: process.env.KEYCHAIN_TEST !== '1' }, () => {
  it('grava, lê, substitui e remove sem deixar rastro', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financeiro-cofre-'))
    const store = await openSecretStore({ service: `financeiro-teste-${process.pid}`, dir })
    try {
      assert.deepEqual(await store.read(), { clientId: null, clientSecret: null })

      await store.write({ clientId: 'id-ficticio-0001', clientSecret: 'segredo.ficticio_0001~+/=' })
      assert.deepEqual(await store.read(), { clientId: 'id-ficticio-0001', clientSecret: 'segredo.ficticio_0001~+/=' })

      await store.write({ clientId: 'id-ficticio-0002', clientSecret: 'segredo-ficticio-0002' })
      assert.deepEqual(await store.read(), { clientId: 'id-ficticio-0002', clientSecret: 'segredo-ficticio-0002' })
    } finally {
      await store.clear()
      fs.rmSync(dir, { recursive: true, force: true })
    }
    assert.deepEqual(await store.read(), { clientId: null, clientSecret: null })
  })
})
