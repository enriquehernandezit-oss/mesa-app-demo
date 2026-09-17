/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'
import { zipSync } from 'fflate'
import { parseInstagramExport, parseInstagramJson } from './instagramImport'

const followersJson = JSON.stringify([
  {
    title: '',
    media_list_data: [],
    string_list_data: [
      { href: 'https://www.instagram.com/anaperez', value: 'anaperez', timestamp: 1 },
    ],
  },
  {
    title: '',
    media_list_data: [],
    string_list_data: [{ href: 'https://www.instagram.com/DiegoR', value: 'DiegoR', timestamp: 2 }],
  },
])

const followingJson = JSON.stringify({
  relationships_following: [
    {
      title: '',
      string_list_data: [
        { href: 'https://www.instagram.com/anaperez', value: 'anaperez', timestamp: 1 },
      ],
    },
    {
      title: '',
      string_list_data: [
        { href: 'https://www.instagram.com/valen_p', value: 'valen_p', timestamp: 3 },
      ],
    },
  ],
})

describe('parseInstagramJson', () => {
  test('followers_1.json — a bare array', () => {
    expect(parseInstagramJson(followersJson)).toEqual(['anaperez', 'diegor'])
  })

  test('following.json — wrapped in relationships_following', () => {
    expect(parseInstagramJson(followingJson)).toEqual(['anaperez', 'valen_p'])
  })

  test('falls back to href when value is missing', () => {
    const json = JSON.stringify([
      { string_list_data: [{ href: 'https://www.instagram.com/mateob/' }] },
    ])
    expect(parseInstagramJson(json)).toEqual(['mateob'])
  })

  test('falls back to title when string_list_data is empty', () => {
    const json = JSON.stringify([{ title: 'lucia.fdz', string_list_data: [] }])
    expect(parseInstagramJson(json)).toEqual(['lucia.fdz'])
  })

  test('dedupes handles that differ only by case', () => {
    const json = JSON.stringify([
      { string_list_data: [{ value: 'Nati' }] },
      { string_list_data: [{ value: 'nati' }] },
    ])
    expect(parseInstagramJson(json)).toEqual(['nati'])
  })

  test('malformed JSON returns empty, never throws', () => {
    expect(parseInstagramJson('{not json')).toEqual([])
  })

  test('valid JSON in an unrecognized shape returns empty', () => {
    expect(parseInstagramJson('{"hello":"world"}')).toEqual([])
    expect(parseInstagramJson('42')).toEqual([])
  })
})

describe('parseInstagramExport', () => {
  test('a bare .json file is parsed directly', async () => {
    const bytes = new TextEncoder().encode(followersJson)
    expect(await parseInstagramExport(bytes, 'followers_1.json')).toEqual(['anaperez', 'diegor'])
  })

  test('a zip finds followers_*.json and following.json wherever nested, merges + dedupes', async () => {
    const zip = zipSync({
      'connections/followers_and_following/followers_1.json': new TextEncoder().encode(
        followersJson,
      ),
      'connections/followers_and_following/following.json': new TextEncoder().encode(followingJson),
      'connections/followers_and_following/README.txt': new TextEncoder().encode('not json'),
    })
    const handles = await parseInstagramExport(zip, 'instagram-export.zip')
    expect(handles.sort()).toEqual(['anaperez', 'diegor', 'valen_p'])
  })

  test('a zip with no matching files returns empty', async () => {
    const zip = zipSync({ 'other/unrelated.json': new TextEncoder().encode('[]') })
    expect(await parseInstagramExport(zip, 'instagram-export.zip')).toEqual([])
  })
})
