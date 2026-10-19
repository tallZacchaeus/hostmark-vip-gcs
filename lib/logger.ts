// Structured JSON logs (one line per entry) for the droplet's log collector.
// Errors keep their stack on the server; clients only ever see ApiError messages.

type Level = 'info' | 'warn' | 'error'

export type LogContext = Readonly<Record<string, unknown>>

export interface Logger {
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

function serialise(value: unknown): unknown {
  if (value instanceof Error) {
    const { code } = value as Error & { code?: unknown }
    return { name: value.name, message: value.message, code, stack: value.stack }
  }
  return value
}

function write(level: Level, message: string, context: LogContext = {}): void {
  const fields = Object.fromEntries(Object.entries(context).map(([key, value]) => [key, serialise(value)]))
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields })
  const stream = level === 'info' ? process.stdout : process.stderr
  stream.write(`${line}\n`)
}

export const logger: Logger = {
  info: (message, context) => write('info', message, context),
  warn: (message, context) => write('warn', message, context),
  error: (message, context) => write('error', message, context),
}
