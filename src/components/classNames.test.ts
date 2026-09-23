import { describe, it, expect } from 'vitest'
import { cx } from './classNames'

describe('cx()', () => {
  it('joins truthy class names', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c')
  })

  it('drops false, null and undefined', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('returns an empty string when nothing survives', () => {
    expect(cx(false, undefined)).toBe('')
  })

  it('supports conditional patterns', () => {
    const active = true
    expect(cx('base', active && 'is-active')).toBe('base is-active')
  })
})
