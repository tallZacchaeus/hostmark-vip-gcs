// The cleaning queue (FR-CL-03/04/05; Figma "Sanitation" and the housekeeping phone): open tasks
// in working order with live ready estimates, and the rooms cleaned today. Rooms only — the
// database function never returns who is staying (housekeeping may not see guest identities).
import { sql } from 'kysely'
import type { Tx } from '@/lib/db/context'
import { type CleaningStatus, orderQueue } from '@/lib/domain/cleaning/queue'
import { zonedDateKey, zonedDayStart } from '@/lib/domain/time'

export type CleaningProblem = 'maintenance' | 'supplies' | 'other'

interface QueueRow {
  readonly task_id: string
  readonly room_id: string
  readonly room_number: string
  readonly floor: number
  readonly wing: string
  readonly room_type: string
  readonly status: CleaningStatus
  readonly checked_out_at: Date
  readonly estimated_ready_at: Date
  readonly started_at: Date | null
  readonly completed_at: Date | null
  readonly cleaning_minutes: number
  readonly buffer_minutes: number
  readonly needed_by: Date | null
  readonly problem_kind: CleaningProblem | null
  readonly problem_note: string | null
  readonly undoable: boolean
}

export interface CleaningItem {
  readonly task_id: string
  readonly room_id: string
  readonly room_number: string
  readonly floor: number
  readonly wing: string
  readonly room_type: string
  readonly status: CleaningStatus
  readonly checked_out_at: string
  readonly started_at: string | null
  readonly completed_at: string | null
  readonly needed_by: string | null
  readonly ready_by: string
  readonly late_by_min: number
  readonly priority: number
  readonly problem_kind: CleaningProblem | null
  readonly problem_note: string | null
  readonly undoable: boolean
}

export interface CleaningView {
  readonly day: string
  readonly timezone: string
  readonly summary: { readonly not_started: number; readonly in_progress: number; readonly done_today: number }
  readonly queue: CleaningItem[]
  readonly done: CleaningItem[]
}

const ms = (value: Date | null): number | null => (value ? new Date(value).getTime() : null)
const iso = (value: number | null): string | null => (value === null ? null : new Date(value).toISOString())

function toTask(row: QueueRow) {
  return {
    ...row,
    checked_out_at: new Date(row.checked_out_at).getTime(),
    estimated_ready_at: new Date(row.estimated_ready_at).getTime(),
    started_at: ms(row.started_at),
    completed_at: ms(row.completed_at),
    needed_by: ms(row.needed_by),
  }
}

type Task = ReturnType<typeof toTask>

function toItem(task: Task, extra: { priority: number; ready_by: number; late_by_min: number }): CleaningItem {
  const { estimated_ready_at: _estimate, cleaning_minutes: _minutes, buffer_minutes: _buffer, ...rest } = task
  return {
    ...rest,
    checked_out_at: new Date(task.checked_out_at).toISOString(),
    started_at: iso(task.started_at),
    completed_at: iso(task.completed_at),
    needed_by: iso(task.needed_by),
    ready_by: new Date(extra.ready_by).toISOString(),
    late_by_min: extra.late_by_min,
    priority: extra.priority,
  }
}

export async function loadCleaning(tx: Tx, now: Date): Promise<CleaningView> {
  const event = await sql<{ timezone: string }>`select (public.get_event_context() ->> 'timezone') as timezone`.execute(tx)
  const timezone = event.rows[0]?.timezone ?? 'UTC'
  const day = zonedDateKey(now, timezone)
  const { rows } = await sql<QueueRow>`select * from public.cleaning_queue(${zonedDayStart(day, timezone)}::timestamptz)`.execute(tx)
  const tasks = rows.map(toTask)
  const queue = orderQueue(tasks, now.getTime()).map((item) => toItem(item, item))
  const done = tasks
    .filter((task) => task.status === 'done')
    .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
    .map((task) => toItem(task, { priority: 0, ready_by: task.completed_at ?? now.getTime(), late_by_min: 0 }))
  return {
    day,
    timezone,
    summary: {
      not_started: queue.filter((item) => item.status === 'pending').length,
      in_progress: queue.filter((item) => item.status === 'in_progress').length,
      done_today: done.length,
    },
    queue,
    done,
  }
}
