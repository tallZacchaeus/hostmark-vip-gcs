// The cleaning queue (FR-CL-03/04): when each room is expected to be ready, whether that is after
// the next guests arrive, and the order housekeeping works in. Pure; times are epoch milliseconds.

export type CleaningStatus = 'pending' | 'in_progress' | 'done'

export interface CleaningTask {
  readonly task_id: string
  readonly room_number: string
  readonly status: CleaningStatus
  readonly checked_out_at: number
  /** FR-CL-03 at check-out: checkout + cleaning minutes + buffer. */
  readonly estimated_ready_at: number
  readonly started_at: number | null
  readonly completed_at: number | null
  readonly cleaning_minutes: number
  readonly buffer_minutes: number
  /** The next planned arrival into the room, if any. */
  readonly needed_by: number | null
}

export type QueueItem<T extends CleaningTask> = T & {
  readonly priority: number
  readonly ready_by: number
  /** Whole minutes the room will be ready after it is needed (0 when on time). */
  readonly late_by_min: number
}

const MINUTE = 60_000

const turnaround = (task: CleaningTask): number => (task.cleaning_minutes + task.buffer_minutes) * MINUTE

/**
 * The live estimate: the check-out estimate while it can still be met; once a waiting room has
 * passed it, cleaning could start now at the earliest; a started clean ends a turnaround after it
 * started (never in the past); a done room was ready when it was marked done.
 */
export function readyBy(task: CleaningTask, now: number): number {
  if (task.status === 'done') return task.completed_at ?? now
  if (task.status === 'in_progress') return Math.max(now, (task.started_at ?? now) + turnaround(task))
  return Math.max(task.estimated_ready_at, now + turnaround(task))
}

export function isLate(task: CleaningTask, now: number): boolean {
  return task.needed_by !== null && readyBy(task, now) > task.needed_by
}

const neededRank = (task: CleaningTask): number => task.needed_by ?? Number.POSITIVE_INFINITY

/** Open tasks in working order: rooms being cleaned, then the soonest incoming guests, then the earliest ready. */
export function orderQueue<T extends CleaningTask>(tasks: readonly T[], now: number): QueueItem<T>[] {
  return tasks
    .filter((task) => task.status !== 'done')
    .map((task) => ({ task, ready: readyBy(task, now) }))
    .sort(
      (a, b) =>
        Number(b.task.status === 'in_progress') - Number(a.task.status === 'in_progress') ||
        neededRank(a.task) - neededRank(b.task) ||
        a.ready - b.ready ||
        a.task.room_number.localeCompare(b.task.room_number, undefined, { numeric: true }),
    )
    .map(({ task, ready }, index) => ({
      ...task,
      priority: index + 1,
      ready_by: ready,
      late_by_min: task.needed_by === null ? 0 : Math.max(0, Math.ceil((ready - task.needed_by) / MINUTE)),
    }))
}
