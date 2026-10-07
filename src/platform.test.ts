import { describe, expect, it } from 'vitest'
import { detectPlatform, readOverride } from './platform'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const PIXEL = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'

describe('detectPlatform', () => {
  it('iPhone et iPad : verre liquide', () => {
    expect(detectPlatform({ userAgent: IPHONE, platform: 'iPhone' })).toBe('ios')
    expect(detectPlatform({ userAgent: IPAD, platform: 'MacIntel' })).toBe('ios')
  })

  it('Android : Material', () => {
    expect(detectPlatform({ userAgent: PIXEL, platform: 'Linux armv8l' })).toBe('android')
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Linux; K)', platform: 'Android' })).toBe('android')
  })

  it('ordinateur : verre liquide par défaut', () => {
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Windows' })).toBe('ios')
    expect(detectPlatform({})).toBe('ios')
  })
})

describe('readOverride', () => {
  it('lit ?ui= avant ou après le #', () => {
    expect(readOverride('?ui=android', '', null)).toBe('android')
    expect(readOverride('', '#/carte?ui=ios', null)).toBe('ios')
    expect(readOverride('', '#/?ui=auto', 'android')).toBe('auto')
  })

  it('sinon le choix mémorisé, valeurs inconnues ignorées', () => {
    expect(readOverride('', '#/', 'android')).toBe('android')
    expect(readOverride('?ui=windows', '#/', 'nimporte')).toBeNull()
  })
})
