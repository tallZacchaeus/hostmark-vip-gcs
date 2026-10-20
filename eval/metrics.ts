// Counting and scoring for the evaluation runners: precision, recall and F1 from counts, and
// multiset matching for "which categories were found in this text".

export interface Counts {
  readonly tp: number
  readonly fp: number
  readonly fn: number
}

export interface Scores {
  readonly precision: number
  readonly recall: number
  readonly f1: number
}

export const ZERO: Counts = { tp: 0, fp: 0, fn: 0 }

export function add(a: Counts, b: Counts): Counts {
  return { tp: a.tp + b.tp, fp: a.fp + b.fp, fn: a.fn + b.fn }
}

const ratio = (part: number, whole: number): number => (whole === 0 ? 1 : part / whole)

/** With nothing expected and nothing predicted, a score is 1 (nothing was missed or invented). */
export function scores({ tp, fp, fn }: Counts): Scores {
  const precision = ratio(tp, tp + fp)
  const recall = ratio(tp, tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { precision, recall, f1 }
}

/** Multiset comparison: ["dietary", "medical"] vs ["dietary", "other"] → 1 TP, 1 FP, 1 FN. */
export function matchLabels(expected: readonly string[], predicted: readonly string[]): Counts {
  const remaining = new Map<string, number>()
  for (const label of expected) remaining.set(label, (remaining.get(label) ?? 0) + 1)
  let tp = 0
  for (const label of predicted) {
    const left = remaining.get(label) ?? 0
    if (left > 0) {
      tp += 1
      remaining.set(label, left - 1)
    }
  }
  return { tp, fp: predicted.length - tp, fn: expected.length - tp }
}

/** One field of a draft: an expected value is found (TP), wrong (FP and FN), missing (FN) or invented (FP). */
export function matchField(expected: string, predicted: string): Counts {
  if (expected === '' && predicted === '') return ZERO
  if (expected === '') return { tp: 0, fp: 1, fn: 0 }
  if (predicted === '') return { tp: 0, fp: 0, fn: 1 }
  return expected === predicted ? { tp: 1, fp: 0, fn: 0 } : { tp: 0, fp: 1, fn: 1 }
}

export const percent = (value: number): string => `${(value * 100).toFixed(1)}%`
