import { describe, expect, test } from 'bun:test'

import { nameCardFontSize, nameCardLines } from './nameCard'

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
