import { describe, expect, it } from 'vitest'
import { formatVersionNumber } from './versionNumber'

describe('formatVersionNumber', () => {
  it('écrit la version sous la forme x.xxx.x', () => {
    expect(formatVersionNumber('0.8.1')).toBe('0.008.1')
    expect(formatVersionNumber('1.12.0')).toBe('1.012.0')
    expect(formatVersionNumber('2.345.6')).toBe('2.345.6')
  })

  it('tolère une version incomplète', () => {
    expect(formatVersionNumber('0.9')).toBe('0.009.0')
    expect(formatVersionNumber('')).toBe('0.000.0')
  })
})
