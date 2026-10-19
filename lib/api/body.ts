// Reads a request body as text, refusing it as soon as it grows past `maxBytes`. Checking only
// Content-Length is not enough: a chunked upload has none, and buffering it whole first would
// let one request exhaust the server's memory.
import { ApiError } from './errors'

const tooLarge = (): ApiError => new ApiError(413, 'payload_too_large', 'The request body is too large')

export async function readLimitedText(request: Request, maxBytes: number): Promise<string> {
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) {
    throw tooLarge()
  }
  if (!request.body) {
    return ''
  }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}
