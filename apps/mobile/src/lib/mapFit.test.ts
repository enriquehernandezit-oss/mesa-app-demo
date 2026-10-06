/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'

import { fitBox } from './mapFit'

const sd = (dLat: number, dLng: number) => ({ lat: 18.47 + dLat, lng: -69.93 + dLng })

describe('fitBox', () => {
  test('boxes the places of one city', () => {
    const box = fitBox([sd(0, 0), sd(0.05, 0.04), sd(-0.03, -0.02)])
    expect(box).toEqual({
      ne: [-69.93 + 0.04, 18.47 + 0.05],
      sw: [-69.93 - 0.02, 18.47 - 0.03],
    })
  })

  test('a place on another continent does not decide the view', () => {
    const miami = { lat: 25.76, lng: -80.19 }
    const madrid = { lat: 40.42, lng: -3.7 }
    const box = fitBox([sd(0, 0), sd(0.05, 0.04), sd(0.02, -0.03), sd(-0.01, 0.01), miami, madrid])
    expect(box).not.toBeNull()
    // still the Santo Domingo box, nowhere near Florida or Spain
    expect(box?.ne[1]).toBeLessThan(19)
    expect(box?.sw[0]).toBeGreaterThan(-71)
  })

  test('one place, or several on the same spot, have no box', () => {
    expect(fitBox([])).toBeNull()
    expect(fitBox([sd(0, 0)])).toBeNull()
    expect(fitBox([sd(0, 0), sd(0, 0)])).toBeNull()
  })

  test('with no dense core at all it still boxes what there is', () => {
    expect(
      fitBox([
        { lat: 40, lng: -3 },
        { lat: -34, lng: 151 },
      ]),
    ).not.toBeNull()
  })
})
