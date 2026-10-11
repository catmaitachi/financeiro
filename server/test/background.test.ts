import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  backgroundOptions,
  financialGlyph,
  financialGlyphTone,
  normalizeBackgroundVariant,
  readBackgroundPreference,
  writeBackgroundPreference,
} from '../../web/src/ui/background-options.ts'
import { createBackgroundPreferenceStore } from '../../web/src/ui/background-preference-store.ts'
import { createFrameScheduler } from '../../web/src/ui/background-runtime.ts'

describe('alternativas de fundo', () => {
  it('usa o mercado como alternativa segura para preferências ausentes ou desconhecidas', () => {
    assert.equal(normalizeBackgroundVariant(null), 'market')
    assert.equal(normalizeBackgroundVariant('desconhecido'), 'market')
  })

  it('preserva cada alternativa reconhecida', () => {
    for (const option of backgroundOptions) {
      assert.equal(normalizeBackgroundVariant(option.value), option.value)
    }
  })

  it('representa variação com triângulos e nunca com setas', () => {
    const glyphs = Array.from({ length: 101 }, (_, index) => financialGlyph(index / 100))

    assert.ok(glyphs.includes('▲'))
    assert.ok(glyphs.includes('▼'))
    assert.ok(glyphs.includes('$'))
    assert.ok(glyphs.every((glyph) => !/[\u2190-\u21ff]/u.test(glyph)))
  })

  it('dá semântica de bolsa aos triângulos sem colorir os demais glifos', () => {
    assert.equal(financialGlyphTone('▲'), 'up')
    assert.equal(financialGlyphTone('▼'), 'down')
    assert.equal(financialGlyphTone('8'), 'neutral')
    assert.equal(financialGlyphTone('%'), 'neutral')
  })

  it('volta para mercado quando o armazenamento do navegador está indisponível', () => {
    const unavailable = {
      getItem() {
        throw new Error('storage blocked')
      },
      setItem() {
        throw new Error('storage blocked')
      },
    }

    assert.equal(readBackgroundPreference(unavailable), 'market')
    assert.equal(writeBackgroundPreference(unavailable, 'grid'), false)
  })

  it('persiste uma alternativa reconhecida quando o armazenamento está disponível', () => {
    let stored: string | null = null
    const available = {
      getItem() {
        return stored
      },
      setItem(_key: string, value: string) {
        stored = value
      },
    }

    assert.equal(writeBackgroundPreference(available, 'ticker'), true)
    assert.equal(readBackgroundPreference(available), 'ticker')
  })

  it('sincroniza a alternativa entre consumidores mesmo quando não consegue persistir', () => {
    const listeners = new Set<(value: string | null) => void>()
    const channel = {
      publish(value: string) {
        for (const listener of listeners) listener(value)
      },
      subscribe(listener: (value: string | null) => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const unavailable = {
      getItem() {
        throw new Error('storage blocked')
      },
      setItem() {
        throw new Error('storage blocked')
      },
    }
    const store = createBackgroundPreferenceStore(unavailable, channel)
    let updates = 0
    const unsubscribe = store.subscribe(() => updates += 1)

    store.set('grid')
    assert.equal(store.getSnapshot(), 'grid')
    assert.equal(updates, 1)

    channel.publish('ticker')
    assert.equal(store.getSnapshot(), 'ticker')
    assert.equal(updates, 2)

    unsubscribe()
    channel.publish('market')
    assert.equal(updates, 2)
  })

  it('agenda, pausa e cancela os quadros sem acordar enquanto está oculto', () => {
    let hidden = true
    let nextId = 1
    let rendered = 0
    const frames = new Map<number, (now: number) => void>()
    const timers = new Map<number, () => void>()
    const cancelledFrames: number[] = []
    const clearedTimers: number[] = []
    const scheduler = createFrameScheduler(
      {
        hidden: () => hidden,
        requestFrame(callback) {
          const id = nextId++
          frames.set(id, callback)
          return id
        },
        cancelFrame(id) {
          cancelledFrames.push(id)
          frames.delete(id)
        },
        setTimer(callback) {
          const id = nextId++
          timers.set(id, callback)
          return id
        },
        clearTimer(id) {
          clearedTimers.push(id)
          timers.delete(id)
        },
      },
      420,
      () => rendered += 1,
    )

    scheduler.play()
    assert.equal(frames.size, 0)

    hidden = false
    scheduler.play()
    assert.equal(frames.size, 1)
    const [frameId, frame] = frames.entries().next().value!
    frames.delete(frameId)
    frame(100)
    assert.equal(rendered, 1)
    assert.equal(timers.size, 1)

    const [timerId, timer] = timers.entries().next().value!
    timers.delete(timerId)
    timer()
    assert.equal(frames.size, 1)

    scheduler.stop()
    assert.ok(cancelledFrames.length > 0)
    assert.ok(clearedTimers.includes(timerId))
  })
})
