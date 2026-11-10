// A stand-in for the browser's EventSource (jsdom has none), so screen tests can push live
// `notification` events the way the server's stream does.
import { vi } from 'vitest'

type Listener = (event: MessageEvent<string>) => void

export class FakeEventSource {
  static instances: FakeEventSource[] = []
  private readonly listeners = new Map<string, Set<Listener>>()
  closed = false

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  close(): void {
    this.closed = true
  }

  /** Delivers a server-sent event to every listener of `type`. */
  emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data }))
    }
  }
}

/** Installs the fake for this test; returns a getter for the newest stream opened. */
export function installEventSource(): () => FakeEventSource {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  return () => {
    const latest = FakeEventSource.instances.at(-1)
    if (!latest) throw new Error('No EventSource was opened')
    return latest
  }
}
