import { describe, expect, test } from 'bun:test'

import { parseArgs } from './places-merge'

describe('places:merge arguments', () => {
  test('every plain argument is a name, in order', () => {
    expect(parseArgs(['Ichiban', 'Shibuya', 'Shibuya Ichiban'])).toEqual({
      names: ['Ichiban', 'Shibuya', 'Shibuya Ichiban'],
      rename: undefined,
      dryRun: false,
    })
  })

  test('the value after --rename is the new name, not a row to merge', () => {
    expect(parseArgs(['Ichiban', 'Shibuya', '--rename', 'Shibuya Ichiban'])).toEqual({
      names: ['Ichiban', 'Shibuya'],
      rename: 'Shibuya Ichiban',
      dryRun: false,
    })
  })

  test('flags may come anywhere', () => {
    expect(parseArgs(['--dry-run', 'Laurel'])).toEqual({
      names: ['Laurel'],
      rename: undefined,
      dryRun: true,
    })
    expect(parseArgs(['Laurel', '--rename', 'Laurel Bistro', '--dry-run']).dryRun).toBe(true)
  })

  test('apostrophes and accents pass through untouched, blanks are dropped', () => {
    expect(parseArgs(["Buche' Perico", ' Buche Perico ', '', 'Restaurante Gijón']).names).toEqual([
      "Buche' Perico",
      'Buche Perico',
      'Restaurante Gijón',
    ])
  })

  test('no names is an empty list, for the script to refuse', () => {
    expect(parseArgs(['--dry-run']).names).toEqual([])
  })
})
