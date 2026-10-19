import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@/lib/logger'

class FakeClient extends EventEmitter {
  static instances: FakeClient[] = []
  readonly queries: string[] = []
  connect = vi.fn(async () => undefined)
  end = vi.fn(async () => undefined)
  query = vi.fn(async (text: string) => {
    this.queries.push(text)
  })

  constructor() {
    super()
    FakeClient.instances.push(this)
  }
}

vi.mock('pg', () => ({ default: { Client: FakeClient } }))

const { createPgChannelSource } = await import('./pg-channel-source')

const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('Postgres LISTEN channel source', () => {
  beforeEach(() => {
    FakeClient.instances = []
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('listens on the channel and forwards only its payloads', async () => {
    const onPayload = vi.fn()
    const stop = await createPgChannelSource('postgres://x', logger).listen('vip_notifications', onPayload)
    const client = FakeClient.instances[0] as FakeClient

    expect(client.queries).toEqual(['listen vip_notifications'])
    client.emit('notification', { channel: 'vip_notifications', payload: '{"a":1}' })
    client.emit('notification', { channel: 'other_channel', payload: '{"b":2}' })
    client.emit('notification', { channel: 'vip_notifications', payload: undefined })
    expect(onPayload).toHaveBeenCalledExactlyOnceWith('{"a":1}')

    await stop()
    expect(client.end).toHaveBeenCalledOnce()
  })

  it('reconnects after the connection drops', async () => {
    const onPayload = vi.fn()
    await createPgChannelSource('postgres://x', logger).listen('vip_notifications', onPayload)
    const first = FakeClient.instances[0] as FakeClient

    first.emit('error', new Error('connection reset'))
    await vi.advanceTimersByTimeAsync(1_000)

    const second = FakeClient.instances[1] as FakeClient
    expect(second.queries).toEqual(['listen vip_notifications'])
    second.emit('notification', { channel: 'vip_notifications', payload: '{}' })
    expect(onPayload).toHaveBeenCalledOnce()
  })

  it('does not reconnect once stopped', async () => {
    const stop = await createPgChannelSource('postgres://x', logger).listen('vip_notifications', vi.fn())
    await stop()
    ;(FakeClient.instances[0] as FakeClient).emit('end')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeClient.instances).toHaveLength(1)
  })

  it('closes the connection when LISTEN fails, without scheduling reconnects', async () => {
    const source = createPgChannelSource('postgres://x', logger)
    const listening = source.listen('vip_notifications', vi.fn())
    const client = FakeClient.instances[0] as FakeClient
    client.query.mockRejectedValueOnce(new Error('permission denied'))

    await expect(listening).rejects.toThrow('permission denied')
    expect(client.end).toHaveBeenCalledOnce()
    client.emit('end')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeClient.instances).toHaveLength(1)
  })

  it('rejects unsafe channel names', async () => {
    await expect(createPgChannelSource('postgres://x', logger).listen('x; drop table', vi.fn())).rejects.toThrow(/Invalid channel/)
  })
})
