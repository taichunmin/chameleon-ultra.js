import {
  WritableStream as NodeWritableStream,
} from 'node:stream/web'
import {
  type ReadableStream,
  type UnderlyingSink,
  WritableStream as WritableStreamPolyfill,
} from 'web-streams-polyfill'

export const WritableStream = typeof NodeWritableStream !== 'undefined' ? NodeWritableStream : WritableStreamPolyfill
export type { UnderlyingSink, ReadableStream }
