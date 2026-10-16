import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addDays,
  daysBetween,
  isDay,
  lastDayOfMonth,
  monthGrid,
  shiftMonths,
  weekdayOf,
  withDayOfMonth,
} from '../../shared/days.ts'

describe('datas civis', () => {
  it('reconhece só datas que existem', () => {
    assert.equal(isDay('2026-10-13'), true)
    assert.equal(isDay('2028-02-29'), true)
    assert.equal(isDay('2026-02-29'), false)
    assert.equal(isDay('2026-13-01'), false)
    assert.equal(isDay('2026-10'), false)
    assert.equal(isDay(20261013), false)
  })

  it('soma dias atravessando meses e anos', () => {
    assert.equal(addDays('2026-10-30', 3), '2026-11-02')
    assert.equal(addDays('2026-01-01', -1), '2025-12-31')
    assert.equal(daysBetween('2026-10-13', '2026-10-20'), 7)
    assert.equal(daysBetween('2026-10-20', '2026-10-13'), -7)
  })

  it('sabe o último dia de cada mês', () => {
    assert.equal(lastDayOfMonth('2026-02'), 28)
    assert.equal(lastDayOfMonth('2028-02'), 29)
    assert.equal(lastDayOfMonth('2026-12'), 31)
  })

  it('desloca meses mantendo o dia quando ele existe no destino', () => {
    assert.equal(shiftMonths('2026-10-10', 1), '2026-11-10')
    assert.equal(shiftMonths('2026-01-31', 1), '2026-02-28')
    assert.equal(shiftMonths('2026-12-15', 2), '2027-02-15')
    assert.equal(shiftMonths('2026-03-05', -3), '2025-12-05')
  })

  it('coloca um dia do mês em uma competência, limitado ao último dia', () => {
    assert.equal(withDayOfMonth('2026-11', 12), '2026-11-12')
    assert.equal(withDayOfMonth('2026-02', 31), '2026-02-28')
  })

  it('dia da semana começa no domingo', () => {
    assert.equal(weekdayOf('2026-10-11'), 0)
    assert.equal(weekdayOf('2026-10-13'), 2)
    assert.equal(weekdayOf('2026-10-17'), 6)
  })
})

describe('grade do mês', () => {
  it('traz semanas inteiras, de domingo a sábado, com os dias vizinhos', () => {
    const grid = monthGrid('2026-10')
    assert.equal(grid.length, 5)
    assert.ok(grid.every((week) => week.length === 7))
    assert.equal(grid[0]![0], '2026-09-27')
    assert.equal(grid[0]![4], '2026-10-01')
    assert.equal(grid.at(-1)![6], '2026-10-31')
  })

  it('um mês que começa no domingo e tem 28 dias ocupa quatro semanas', () => {
    const grid = monthGrid('2026-02')
    assert.equal(grid.length, 4)
    assert.equal(grid[0]![0], '2026-02-01')
    assert.equal(grid.at(-1)![6], '2026-02-28')
  })

  it('um mês longo que começa no sábado ocupa seis semanas', () => {
    const grid = monthGrid('2026-08')
    assert.equal(grid.length, 6)
    assert.equal(grid[0]![6], '2026-08-01')
    assert.equal(grid.at(-1)![1], '2026-08-31')
  })
})
