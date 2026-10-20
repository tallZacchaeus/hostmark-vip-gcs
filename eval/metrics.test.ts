import { describe, expect, it } from 'vitest'
import { add, matchField, matchLabels, scores } from './metrics'

describe('matchLabels', () => {
  it('counts a multiset match', () => {
    expect(matchLabels(['dietary', 'medical'], ['dietary', 'other'])).toEqual({ tp: 1, fp: 1, fn: 1 })
    expect(matchLabels(['schedule', 'schedule'], ['schedule'])).toEqual({ tp: 1, fp: 0, fn: 1 })
    expect(matchLabels([], [])).toEqual({ tp: 0, fp: 0, fn: 0 })
  })
})

describe('matchField', () => {
  it('scores found, wrong, missing and invented values', () => {
    expect(matchField('EK783', 'EK783')).toEqual({ tp: 1, fp: 0, fn: 0 })
    expect(matchField('EK783', 'ET512')).toEqual({ tp: 0, fp: 1, fn: 1 })
    expect(matchField('EK783', '')).toEqual({ tp: 0, fp: 0, fn: 1 })
    expect(matchField('', 'EK783')).toEqual({ tp: 0, fp: 1, fn: 0 })
  })
})

describe('scores', () => {
  it('computes precision, recall and F1, treating an empty comparison as perfect', () => {
    expect(scores({ tp: 3, fp: 1, fn: 2 })).toEqual({ precision: 0.75, recall: 0.6, f1: (2 * 0.75 * 0.6) / 1.35 })
    expect(scores({ tp: 0, fp: 0, fn: 0 })).toEqual({ precision: 1, recall: 1, f1: 1 })
    expect(scores({ tp: 0, fp: 2, fn: 2 }).f1).toBe(0)
    expect(add({ tp: 1, fp: 0, fn: 2 }, { tp: 1, fp: 1, fn: 0 })).toEqual({ tp: 2, fp: 1, fn: 2 })
  })
})
