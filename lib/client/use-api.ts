'use client'
// Server state on the client goes through SWR (cache, revalidation, de-duplication). Keys are API
// paths, so a mutation can refresh everything under a prefix with refreshApi('/api/guests').
import useSWR, { type KeyedMutator, mutate as globalMutate } from 'swr'
import { type ApiResult, type PaginationMeta, apiRequest } from './api'

export interface ApiState<T> {
  readonly data: T | undefined
  readonly meta: PaginationMeta | undefined
  readonly error: unknown
  readonly isLoading: boolean
  readonly mutate: KeyedMutator<ApiResult<T>>
}

export function apiFetcher<T>(path: string): Promise<ApiResult<T>> {
  return apiRequest<T>(path)
}

/** GET an API path (null pauses the request). */
export function useApi<T>(path: string | null, options: { readonly refreshInterval?: number } = {}): ApiState<T> {
  const { data, error, isLoading, mutate } = useSWR<ApiResult<T>>(path, apiFetcher<T>, {
    refreshInterval: options.refreshInterval,
  })
  return { data: data?.data, meta: data?.meta, error, isLoading, mutate }
}

/** Revalidates every cached API response whose path starts with one of the prefixes. */
export function refreshApi(...prefixes: string[]): Promise<unknown> {
  return globalMutate((key) => typeof key === 'string' && prefixes.some((prefix) => key.startsWith(prefix)))
}
