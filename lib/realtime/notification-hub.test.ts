import { describe, expect, it, vi } from 'vitest'
import type { Logger } from '@/lib/logger'
import { type ChannelSource, MAX_STREAMS_PER_USER, NOTIFICATION_CHANNEL, createNotificationHub } from './notification-hub'

const ADA = '11111111-1111-4111-8111-111111111111'
const TUNDE = '22222222-2222-4222-8222-222222222222'

function fakeSource() {
  let deliver: (payload: string) => void = () => undefined
  const stop = vi.fn(async () => undefined)
  const source: ChannelSource = {
    listen: vi.fn(async (channel, onPayload) => {
      expect(channel).toBe(NOTIFICATION_CHANNEL)
      deliver = onPayload
      return stop
    }),
  }
  const emit = (recipient: string, kind = 'pickup_changed') =>
    deliver(JSON.stringify({ id: crypto.randomUUID(), recipient_id: recipient, kind, priority: 'normal' }))
  return { source, stop, emit, raw: (payload: string) => deliver(payload) }
}

const quietLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

describe('notification hub', () => {
  it('delivers each event only to the recipient’s listeners', async () => {
    const { source, emit } = fakeSource()
    const hub = createNotificationHub(source, quietLogger())
    const ada = vi.fn()
    const tunde = vi.fn()
    await hub.subscribe(ADA, ada)
    await hub.subscribe(TUNDE, tunde)

    emit(ADA)
    expect(ada).toHaveBeenCalledOnce()
    expect(tunde).not.toHaveBeenCalled()
  })

  it('opens the Postgres listener once, on first subscription', async () => {
    const { source } = fakeSource()
    const hub = createNotificationHub(source, quietLogger())
    await hub.subscribe(ADA, vi.fn())
    await hub.subscribe(TUNDE, vi.fn())
    expect(source.listen).toHaveBeenCalledOnce()
  })

  it('stops delivering after unsubscribe', async () => {
    const { source, emit } = fakeSource()
    const hub = createNotificationHub(source, quietLogger())
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = await hub.subscribe(ADA, first)
    const stopSecond = await hub.subscribe(ADA, second)

    stopFirst?.()
    emit(ADA)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()

    stopSecond?.()
    expect(hub.listenerCount(ADA)).toBe(0)
  })

  it('caps open streams per user', async () => {
    const { source } = fakeSource()
    const hub = createNotificationHub(source, quietLogger())
    for (let index = 0; index < MAX_STREAMS_PER_USER; index += 1) {
      expect(await hub.subscribe(ADA, vi.fn())).toBeTypeOf('function')
    }
    expect(await hub.subscribe(ADA, vi.fn())).toBeNull()
  })

  it('ignores malformed events and logs a warning', async () => {
    const { source, raw } = fakeSource()
    const logger = quietLogger()
    const hub = createNotificationHub(source, logger)
    const listener = vi.fn()
    await hub.subscribe(ADA, listener)

    raw('not json')
    raw(JSON.stringify({ id: 'x', recipient_id: ADA }))
    expect(listener).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(2)
  })

  it('keeps every concurrent subscription for the same user and still enforces the cap', async () => {
    const { source, emit } = fakeSource()
    const hub = createNotificationHub(source, quietLogger())
    const listeners = Array.from({ length: MAX_STREAMS_PER_USER + 2 }, () => vi.fn())

    const results = await Promise.all(listeners.map((listener) => hub.subscribe(ADA, listener)))
    expect(results.filter((result) => result === null)).toHaveLength(2)
    expect(hub.listenerCount(ADA)).toBe(MAX_STREAMS_PER_USER)

    emit(ADA)
    expect(listeners.filter((listener) => listener.mock.calls.length === 1)).toHaveLength(MAX_STREAMS_PER_USER)
  })

  it('retries LISTEN after a failed first attempt instead of failing forever', async () => {
    const stop = vi.fn(async () => undefined)
    const listen = vi
      .fn<ChannelSource['listen']>()
      .mockRejectedValueOnce(new Error('database restarting'))
      .mockResolvedValue(stop)
    const hub = createNotificationHub({ listen }, quietLogger())

    await expect(hub.subscribe(ADA, vi.fn())).rejects.toThrow('database restarting')
    await expect(hub.subscribe(ADA, vi.fn())).resolves.toBeTypeOf('function')
    expect(listen).toHaveBeenCalledTimes(2)
  })

  it('keeps delivering when one listener throws', async () => {
    const { source, emit } = fakeSource()
    const logger = quietLogger()
    const hub = createNotificationHub(source, logger)
    const healthy = vi.fn()
    await hub.subscribe(ADA, () => {
      throw new Error('stream closed')
    })
    await hub.subscribe(ADA, healthy)

    emit(ADA)
    expect(healthy).toHaveBeenCalledOnce()
    expect(logger.warn).toHaveBeenCalledOnce()
  })

  it('stops the listener on close', async () => {
    const { source, stop } = fakeSource()
    const hub = createNotificationHub(source, quietLogger())
    await hub.subscribe(ADA, vi.fn())
    await hub.close()
    expect(stop).toHaveBeenCalledOnce()
    expect(hub.listenerCount(ADA)).toBe(0)
  })
})
