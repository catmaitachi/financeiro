import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { DpapiSecretStore } from '../src/modules/credentials/dpapi-secret-store.ts'
import { FileSecretStore } from '../src/modules/credentials/file-secret-store.ts'
import { LibsecretSecretStore } from '../src/modules/credentials/libsecret-secret-store.ts'
import { openSecretStore } from '../src/modules/credentials/open-secret-store.ts'
import type { CommandRunner } from '../src/modules/credentials/run-command.ts'

const PAIR = { clientId: 'id-ficticio-0001', clientSecret: 'segredo.ficticio_0001~+/=' }
const EMPTY = { clientId: null, clientSecret: null }

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financeiro-cofre-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

/** Faz as vezes da DPAPI: "cifra" invertendo os bytes, o bastante para o texto puro não aparecer no arquivo. */
function fakeDpapi() {
  const calls: { args: string[]; stdin: string }[] = []
  const run: CommandRunner = async (_file, args, stdin = '') => {
    calls.push({ args, stdin })
    return { code: 0, stdout: Buffer.from(stdin, 'base64').reverse().toString('base64') }
  }
  return { run, calls }
}

/** Faz as vezes do `secret-tool`, com os mesmos códigos de saída. */
function fakeSecretTool() {
  const items = new Map<string, string>()
  const calls: string[][] = []
  const run: CommandRunner = async (_file, args, stdin = '') => {
    calls.push(args)
    const [command, ...rest] = args
    const key = rest.filter((arg) => !arg.startsWith('--')).join(' ')
    if (command === 'store') items.set(key, stdin)
    if (command === 'clear') return { code: items.delete(key) ? 0 : 1, stdout: '' }
    if (command === 'lookup') return items.has(key) ? { code: 0, stdout: items.get(key)! } : { code: 1, stdout: '' }
    return { code: 0, stdout: '' }
  }
  return { run, calls, items }
}

describe('cofre em arquivo', () => {
  it('grava, lê, substitui e remove', async () => {
    const store = new FileSecretStore('financeiro-teste', dir)
    assert.deepEqual(await store.read(), EMPTY)

    await store.write(PAIR)
    assert.deepEqual(await store.read(), PAIR)
    // Outra instância lê o mesmo arquivo: é o que faz as credenciais sobreviverem ao reinício.
    assert.deepEqual(await new FileSecretStore('financeiro-teste', dir).read(), PAIR)

    await store.write({ clientId: 'id-ficticio-0002', clientSecret: 'segredo-ficticio-0002' })
    assert.equal((await store.read()).clientSecret, 'segredo-ficticio-0002')

    await store.clear()
    assert.deepEqual(await store.read(), EMPTY)
    await store.clear()
  })

  it('o arquivo é legível só pelo dono', { skip: process.platform === 'win32' }, async () => {
    await new FileSecretStore('financeiro-teste', dir).write(PAIR)

    assert.equal(fs.statSync(path.join(dir, 'financeiro-teste.json')).mode & 0o777, 0o600)
  })

  it('serviços diferentes não se misturam', async () => {
    await new FileSecretStore('financeiro-pluggy', dir).write(PAIR)

    assert.deepEqual(await new FileSecretStore('financeiro-pluggy-mcp', dir).read(), EMPTY)
  })

  it('recusa nome de serviço que escaparia da pasta', () => {
    assert.throws(() => new FileSecretStore('../fora', dir))
    assert.throws(() => new FileSecretStore('com/barra', dir))
    assert.throws(() => new DpapiSecretStore('..', dir))
  })

  it('avisa quando o arquivo está corrompido em vez de fingir que está vazio', async () => {
    fs.writeFileSync(path.join(dir, 'financeiro-teste.json'), '{ não é json')

    await assert.rejects(new FileSecretStore('financeiro-teste', dir).read())
  })
})

describe('cofre do Windows (DPAPI)', () => {
  it('grava cifrado, lê de volta e remove', async () => {
    const { run } = fakeDpapi()
    const store = new DpapiSecretStore('financeiro-teste', dir, run)
    assert.deepEqual(await store.read(), EMPTY)

    await store.write(PAIR)
    const onDisk = fs.readFileSync(path.join(dir, 'financeiro-teste.dpapi'), 'utf8')
    assert.ok(!onDisk.includes(PAIR.clientSecret))
    assert.ok(!Buffer.from(onDisk, 'base64').toString('utf8').includes(PAIR.clientSecret))
    assert.deepEqual(await new DpapiSecretStore('financeiro-teste', dir, run).read(), PAIR)

    await store.clear()
    assert.deepEqual(await store.read(), EMPTY)
  })

  it('o segredo vai pela entrada padrão, nunca nos argumentos', async () => {
    const { run, calls } = fakeDpapi()
    await new DpapiSecretStore('financeiro-teste', dir, run).write(PAIR)

    const plain = Buffer.from(JSON.stringify(PAIR)).toString('base64')
    assert.equal(calls[0]!.stdin, plain)
    assert.ok(!calls[0]!.args.join(' ').includes(plain))
    assert.ok(!calls[0]!.args.join(' ').includes(PAIR.clientSecret))
  })

  it('falha do Windows não grava nem devolve lixo', async () => {
    const failing: CommandRunner = async () => ({ code: 1, stdout: '' })
    const store = new DpapiSecretStore('financeiro-teste', dir, failing)

    await assert.rejects(store.write(PAIR))
    assert.equal(fs.existsSync(path.join(dir, 'financeiro-teste.dpapi')), false)

    await new DpapiSecretStore('financeiro-teste', dir, fakeDpapi().run).write(PAIR)
    await assert.rejects(store.read())
  })
})

describe('chaveiro do Linux (secret-tool)', () => {
  it('grava, lê, substitui e remove', async () => {
    const { run } = fakeSecretTool()
    const store = new LibsecretSecretStore('financeiro-teste', undefined, run)
    assert.deepEqual(await store.read(), EMPTY)

    await store.write(PAIR)
    assert.deepEqual(await store.read(), PAIR)

    await store.write({ clientId: 'id-ficticio-0002', clientSecret: 'segredo-ficticio-0002' })
    assert.equal((await store.read()).clientSecret, 'segredo-ficticio-0002')

    await store.clear()
    assert.deepEqual(await store.read(), EMPTY)
    await store.clear()
  })

  it('o segredo vai pela entrada padrão, nunca nos argumentos', async () => {
    const { run, calls } = fakeSecretTool()
    await new LibsecretSecretStore('financeiro-teste', undefined, run).write(PAIR)

    assert.ok(!calls.flat().some((arg) => arg.includes(PAIR.clientSecret) || arg.includes(PAIR.clientId)))
  })

  it('chaveiro com defeito vira erro, não "sem credenciais"', async () => {
    const broken: CommandRunner = async () => ({ code: 2, stdout: '' })

    await assert.rejects(new LibsecretSecretStore('financeiro-teste', undefined, broken).read())
  })
})

describe('escolha do cofre', () => {
  const open = (platform: NodeJS.Platform, run?: CommandRunner) =>
    openSecretStore({ service: 'financeiro-teste', dir, platform, run })

  it('cada sistema recebe o seu', async () => {
    assert.equal((await open('darwin')).kind, 'keychain')
    assert.equal((await open('win32', fakeDpapi().run)).kind, 'dpapi')
    assert.equal((await open('linux', fakeSecretTool().run)).kind, 'libsecret')
  })

  it('Linux sem chaveiro cai no arquivo local', async () => {
    const missing: CommandRunner = async () => {
      throw Object.assign(new Error('spawn secret-tool ENOENT'), { code: 'ENOENT' })
    }
    const noSession: CommandRunner = async () => ({ code: 2, stdout: '' })

    assert.equal((await open('linux', missing)).kind, 'file')
    assert.equal((await open('linux', noSession)).kind, 'file')
  })

  it('quando o chaveiro aparece, o que estava no arquivo vai para ele e o arquivo some', async () => {
    await new FileSecretStore('financeiro-teste', dir).write(PAIR)

    const store = await open('linux', fakeSecretTool().run)

    assert.equal(store.kind, 'libsecret')
    assert.deepEqual(await store.read(), PAIR)
    assert.equal(fs.existsSync(path.join(dir, 'financeiro-teste.json')), false)
  })

  it('o que já está no chaveiro prevalece sobre o arquivo antigo', async () => {
    const tool = fakeSecretTool()
    const newer = { clientId: 'id-ficticio-0002', clientSecret: 'segredo-ficticio-0002' }
    await new LibsecretSecretStore('financeiro-teste', undefined, tool.run).write(newer)
    await new FileSecretStore('financeiro-teste', dir).write(PAIR)

    const store = await open('linux', tool.run)

    assert.deepEqual(await store.read(), newer)
    assert.equal(fs.existsSync(path.join(dir, 'financeiro-teste.json')), false)
  })

  it('se o chaveiro recusa a mudança, o arquivo continua valendo', async () => {
    await new FileSecretStore('financeiro-teste', dir).write(PAIR)
    const readOnly: CommandRunner = async (_file, args) => ({ code: args[0] === 'lookup' ? 1 : 2, stdout: '' })

    const store = await open('linux', readOnly)

    assert.equal(store.kind, 'file')
    assert.deepEqual(await store.read(), PAIR)
  })

  it('sistema sem cofre conhecido também cai no arquivo local', async () => {
    assert.equal((await open('freebsd')).kind, 'file')
  })
})
