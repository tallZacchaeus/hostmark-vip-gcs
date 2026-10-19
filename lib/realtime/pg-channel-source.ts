// LISTEN on a dedicated Postgres connection (pooled connections cannot hold a LISTEN). If the
// connection drops, it reconnects with exponential backoff so open streams resume on their own.
import 'server-only'
import pg from 'pg'
import type { Logger } from '@/lib/logger'
import type { ChannelSource } from './notification-hub'

const MIN_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000
const CHANNEL_NAME = /^[a-z_]{1,63}$/

export function createPgChannelSource(connectionString: string, logger: Logger): ChannelSource {
  return {
    async listen(channel, onPayload) {
      if (!CHANNEL_NAME.test(channel)) {
        throw new Error(`Invalid channel name: ${channel}`)
      }
      let client: pg.Client | undefined
      let stopped = false
      let retryDelay = MIN_RETRY_MS
      let reconnectTimer: NodeJS.Timeout | undefined

      const scheduleReconnect = (): void => {
        if (stopped || reconnectTimer) {
          return
        }
        client = undefined
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined
          connect().catch((error: unknown) => {
            logger.error('Notification listener could not reconnect', { error, retryDelay })
            scheduleReconnect()
          })
        }, retryDelay)
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS)
      }

      const connect = async (): Promise<void> => {
        const next = new pg.Client({ connectionString, application_name: 'vip-gcs-listen' })
        // Swallow errors emitted while connecting; the connect/query promise reports them.
        const ignoreWhileConnecting = (): void => undefined
        next.on('error', ignoreWhileConnecting)
        try {
          await next.connect()
          await next.query(`listen ${channel}`)
        } catch (error: unknown) {
          await next.end().catch(() => undefined)
          throw error
        }
        if (stopped) {
          // Unsubscribed while this (re)connect was in flight.
          await next.end()
          return
        }
        next.off('error', ignoreWhileConnecting)
        next.on('notification', (message) => {
          if (message.channel === channel && message.payload) {
            onPayload(message.payload)
          }
        })
        next.on('error', (error) => {
          logger.error('Notification listener connection failed', { error })
          scheduleReconnect()
        })
        next.on('end', scheduleReconnect)
        client = next
        retryDelay = MIN_RETRY_MS
      }

      await connect()
      return async () => {
        stopped = true
        clearTimeout(reconnectTimer)
        await client?.end()
      }
    },
  }
}
