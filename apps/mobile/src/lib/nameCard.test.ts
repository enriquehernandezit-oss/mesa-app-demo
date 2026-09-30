import { describe, expect, test } from 'bun:test'

import { heroNameSize, nameCardFontSize, nameCardLines } from './nameCard'

describe('nameCardLines', () => {
  test('a short name is one line', () => {
    expect(nameCardLines('La Pinseria', 26, 358)).toBe(1)
  })
  test('wraps by word when the column is narrow', () => {
    expect(nameCardLines('Pasta Factory Piantini', 12, 46)).toBe(3)
    expect(nameCardLines('Shibuya Ichiban', 12, 46)).toBe(2)
  })
  test('a word wider than the column counts as the lines it breaks over', () => {
    expect(nameCardLines('Argentinos', 20, 46)).toBeGreaterThan(1)
  })
  test('no room means no fit', () => {
    expect(nameCardLines('La Pinseria', 12, 0)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('nameCardFontSize', () => {
  test('a wide hero card sets a short name at a fifth of its height', () => {
    expect(nameCardFontSize('La Pinseria', 370, 132)).toBe(26)
    expect(nameCardFontSize('Shibuya Ichiban', 370, 132)).toBe(26)
  })
  test('never above 28 nor below the floor', () => {
    expect(nameCardFontSize('Mesa', 800, 800)).toBe(28)
    expect(
      nameCardFontSize('A very long restaurant name that cannot possibly fit here', 58, 62),
    ).toBe(9)
  })
  test('a small tile keeps a readable size for an ordinary name', () => {
    expect(nameCardFontSize('KIJÁ', 58, 62)).toBe(12)
    expect(nameCardFontSize('Pasta Factory Piantini', 58, 62)).toBeGreaterThanOrEqual(10)
  })
  test('shrinks a long word to fit the column', () => {
    const size = nameCardFontSize('Asadero Los Argentinos', 58, 62)
    expect(size).toBeLessThan(12)
    expect(size).toBeGreaterThanOrEqual(9)
  })
})

describe('heroNameSize', () => {
  const column = 330 // a 402pt screen less the hero's side padding and the panel's

  test('a short name is set at the full size', () => {
    expect(heroNameSize('Cantábrico', column, 46)).toBe(46)
    expect(heroNameSize('Mesa', column, 40)).toBe(40)
  })

  test('a long name steps down until it fits two lines', () => {
    const size = heroNameSize("Pat'e Palo European Brasserie", column, 46)
    expect(size).toBeLessThan(46)
    expect(size).toBeGreaterThanOrEqual(24)
    expect(nameCardLines("Pat'e Palo European Brasserie", size, column)).toBeLessThanOrEqual(2)
  })

  test('a larger text-size setting makes room for fewer characters', () => {
    const name = 'Restaurante La Casa del Pescador'
    expect(heroNameSize(name, column, 46, 1.35)).toBeLessThan(heroNameSize(name, column, 46, 1))
  })

  test('never below the floor, however long', () => {
    expect(heroNameSize('x'.repeat(200), column, 46)).toBe(24)
  })
})
