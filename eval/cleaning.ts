// Turnaround simulation for the cleaning evaluation (PRD §8, M5 estimate error): a seeded day of
// check-outs worked by K cleaners who always take the next room in the app's priority order
// (orderQueue). Each clean takes the room type's minutes times a random factor. The estimate is
// FR-CL-03 at check-out (checkout + cleaning minutes + buffer); the error is |actual − estimate|.
import { type CleaningTask, orderQueue } from '@/lib/domain/cleaning/queue'
import { random } from './allocation'

const MINUTE = 60_000
const DAY_START = Date.parse('2026-11-22T07:00:00Z')
const ROOM_TYPES = [
  { name: 'Standard', minutes: 30 },
  { name: 'Deluxe', minutes: 45 },
  { name: 'Suite', minutes: 60 },
] as const

export interface TurnaroundOptions {
  readonly seed: number
  readonly checkouts: number
  readonly cleaners: number
  readonly bufferMinutes: number
  /** Check-outs spread over this many minutes from 07:00 (most leave in the morning). */
  readonly spreadMinutes: number
  /** Each clean takes minutes × a factor drawn uniformly from this range. */
  readonly durationFactor: readonly [number, number]
}

export interface TurnaroundResult {
  readonly rooms: number
  readonly maeMinutes: number
  readonly p90Minutes: number
  /** Rooms ready after the next guests' arrival. */
  readonly late: number
}

interface SimTask extends CleaningTask {
  readonly duration: number
}

function buildTasks(options: TurnaroundOptions, rand: () => number): SimTask[] {
  const [low, high] = options.durationFactor
  return Array.from({ length: options.checkouts }, (_, index) => {
    const type = ROOM_TYPES[Math.floor(rand() * ROOM_TYPES.length)] ?? ROOM_TYPES[0]
    // Morning-heavy: squaring a uniform draw packs check-outs towards the start of the spread.
    const out = DAY_START + Math.floor(rand() ** 2 * options.spreadMinutes) * MINUTE
    const hasNextGuest = rand() < 0.6
    return {
      task_id: `t${index}`,
      room_number: String(100 + index),
      status: 'pending' as const,
      checked_out_at: out,
      estimated_ready_at: out + (type.minutes + options.bufferMinutes) * MINUTE,
      started_at: null,
      completed_at: null,
      cleaning_minutes: type.minutes,
      buffer_minutes: options.bufferMinutes,
      needed_by: hasNextGuest ? out + (90 + Math.floor(rand() * 240)) * MINUTE : null,
      duration: Math.round(type.minutes * (low + rand() * (high - low))) * MINUTE,
    }
  })
}

/** Event-driven: whenever a cleaner is free, they take the top waiting room that has been checked out. */
export function simulateTurnaround(options: TurnaroundOptions): TurnaroundResult {
  const rand = random(options.seed)
  const tasks = buildTasks(options, rand)
  const freeAt = Array.from({ length: options.cleaners }, () => DAY_START)
  const ready = new Map<string, number>()
  let waiting = [...tasks]
  while (waiting.length > 0) {
    const cleaner = freeAt.indexOf(Math.min(...freeAt))
    const now = Math.max(freeAt[cleaner] ?? DAY_START, Math.min(...waiting.map((task) => task.checked_out_at)))
    const [next] = orderQueue(waiting.filter((task) => task.checked_out_at <= now), now)
    if (!next) continue
    const done = now + next.duration
    ready.set(next.task_id, done)
    freeAt[cleaner] = done
    waiting = waiting.filter((task) => task.task_id !== next.task_id)
  }
  const errors = tasks.map((task) => Math.abs((ready.get(task.task_id) ?? 0) - task.estimated_ready_at) / MINUTE).sort((a, b) => a - b)
  const late = tasks.filter((task) => task.needed_by !== null && (ready.get(task.task_id) ?? 0) > task.needed_by).length
  return {
    rooms: tasks.length,
    maeMinutes: errors.reduce((sum, error) => sum + error, 0) / Math.max(1, errors.length),
    p90Minutes: errors[Math.min(errors.length - 1, Math.floor(errors.length * 0.9))] ?? 0,
    late,
  }
}
