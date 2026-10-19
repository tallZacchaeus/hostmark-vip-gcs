// The process-wide notification hub, created on first use.
import 'server-only'
import { getChannelSource } from '@/lib/db/client'
import { logger } from '@/lib/logger'
import { type NotificationHub, createNotificationHub } from './notification-hub'

let hub: NotificationHub | undefined

export function getNotificationHub(): NotificationHub {
  hub ??= createNotificationHub(getChannelSource(), logger)
  return hub
}

export async function resetNotificationHubForTesting(): Promise<void> {
  await hub?.close()
  hub = undefined
}
