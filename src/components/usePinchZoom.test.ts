import { describe, expect, it } from 'vitest'
import { freeToPinch } from './usePinchZoom'

/** Élément simulé : `closest` répond oui pour les sélecteurs qui contiennent `match`. */
const el = (match: string | null) =>
  ({ closest: (selectors: string) => (match && selectors.includes(match) ? {} : null) }) as unknown as EventTarget

describe('viseur : pincer pour zoomer', () => {
  it('part du décor, des photos et du rail', () => {
    expect(freeToPinch(el(null))).toBe(true)
    expect(freeToPinch(null)).toBe(true)
  })

  it('pas des éléments qui ont leurs propres gestes, ni des boutons du zoom', () => {
    expect(freeToPinch(el('.shutter-group'))).toBe(false)
    expect(freeToPinch(el('.home-timeline'))).toBe(false)
    expect(freeToPinch(el('[role="dialog"]'))).toBe(false)
    expect(freeToPinch(el('.zoom-lenses'))).toBe(false)
  })
})
