import { type Buffer } from '@taichunmin/buffer'
import { type Transformer, type TransformStreamDefaultController } from 'stream/web'

export enum SlipByte {
  END = 0xC0,
  ESC = 0xDB,
  ESC_END = 0xDC,
  ESC_ESC = 0xDD,
}

export class SlipDecodeTransformer implements Transformer<Buffer, Buffer> {
  readonly #bufs: Buffer[] = []
  readonly #Buffer: typeof Buffer

  constructor (_Buffer: typeof Buffer) {
    this.#Buffer = _Buffer
  }

  transform (chunk: Buffer, controller: TransformStreamDefaultController<Buffer>): void {
    if (!this.#Buffer.isBuffer(chunk)) chunk = this.#Buffer.fromView(chunk)
    this.#bufs.push(chunk)
    let buf = this.#Buffer.concat(this.#bufs.splice(0, this.#bufs.length))
    try {
      while (buf.length > 0) {
        const endIdx = buf.indexOf(SlipByte.END)
        if (endIdx < 0) break // break, END not found
        const decoded = slipDecode(buf.subarray(0, endIdx + 1))
        if (decoded.length > 0) controller.enqueue(decoded)
        buf = buf.subarray(endIdx + 1)
      }
    } finally {
      if (buf.length > 0) this.#bufs.push(buf)
    }
  }
}

/**
 * @group Internal
 * @internal
 */
export function slipEncode (buf: Buffer, Buffer1: typeof Buffer): Buffer {
  let len1 = buf.length
  for (const b of buf) if (b === SlipByte.END || b === SlipByte.ESC) len1++
  const encoded = Buffer1.alloc(len1 + 1)
  let i = 0
  for (const byte of buf) {
    if (byte === SlipByte.END) {
      encoded[i++] = SlipByte.ESC
      encoded[i++] = SlipByte.ESC_END
    } else if (byte === SlipByte.ESC) {
      encoded[i++] = SlipByte.ESC
      encoded[i++] = SlipByte.ESC_ESC
    } else {
      encoded[i++] = byte
    }
  }
  encoded[i] = SlipByte.END
  return encoded
}

/**
 * @group Internal
 * @internal
 */
export function slipDecode (buf: Buffer): Buffer {
  let len1 = 0
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === SlipByte.ESC) {
      if ((++i) >= buf.length) break
      if (buf[i] === SlipByte.ESC_END) buf[len1++] = SlipByte.END
      else if (buf[i] === SlipByte.ESC_ESC) buf[len1++] = SlipByte.ESC
    } else if (buf[i] === SlipByte.END) break
    else buf[len1++] = buf[i]
  }
  return buf.slice(0, len1)
}
