import { type Buffer } from '@taichunmin/buffer'
import _ from 'lodash'
import { TransformStream, WritableStream, type Transformer, type TransformStreamDefaultController } from 'stream/web'
import { serial, type SerialPort } from 'web-serial-polyfill'
import { type ChameleonPlugin, type ChameleonUltra, type PluginInstallContext } from '../ChameleonUltra'
import { type EventEmitter } from '../EventEmitter'
import { sleep } from '../helper'
import { setObject } from '../iifeExportHelper'
import { DfuOp } from '../enums'

// https://github.com/RfidResearchGroup/ChameleonUltra/blob/main/resource/tools/enter_dfu.py
const WEBSERIAL_FILTERS = [
  { usbVendorId: 0x6868, usbProductId: 0x8686 }, // Chameleon Ultra
  { usbVendorId: 0x1915, usbProductId: 0x521F }, // Chameleon Ultra DFU
]

function u16ToHex (num: number): string {
  return _.toUpper(`000${num.toString(16)}`.slice(-4))
}

/**
 * @see
 * - [Web Serial API | MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
 * - [Getting started with the Web Serial API | codelabs](https://codelabs.developers.google.com/codelabs/web-serial#0)
 * - [Read from and write to a serial port | Chrome for Developers](https://developer.chrome.com/docs/capabilities/serial)
 */
export default class WebserialAdapter implements ChameleonPlugin {
  #isDfu: boolean = false
  #isOpen: boolean = false
  name = 'adapter'
  port: SerialPort1 | null = null
  readonly #emitErr: (err: Error) => void
  readonly #serial: typeof serial
  readonly #TransformStream: typeof TransformStream
  readonly #WritableStream: typeof WritableStream
  ultra?: ChameleonUltra

  constructor () {
    const navigator = (globalThis as any)?.navigator ?? {}
    this.#TransformStream = (globalThis as any)?.TransformStream ?? TransformStream
    this.#WritableStream = (globalThis as any)?.WritableStream ?? WritableStream
    this.#serial = navigator.serial ?? ('usb' in navigator ? serial : null)
    this.#emitErr = (err: Error): void => { this.ultra?.emitter.emit('error', _.set(new Error(err.message), 'originalError', err)) }
  }

  #debug (formatter: any, ...args: [] | any[]): void {
    this.ultra?.emitter.emit('debug', 'webserial', formatter, ...args)
  }

  async install (context: AdapterInstallContext, pluginOption: any): Promise<AdapterInstallResp> {
    const ultra = this.ultra = context.ultra
    const Buffer1 = context.Buffer

    if (!_.isNil(ultra.$adapter)) await ultra.disconnect(new Error('adapter replaced'))
    const adapter: AdapterInstallResp = {
      isSupported: () => !_.isNil(this.#serial),
    }

    ultra.addHook('connect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      try {
        if (!adapter.isSupported()) throw new Error('WebSerial not supported')
        this.port = await this.#serial.requestPort({ filters: WEBSERIAL_FILTERS }) as SerialPort1
        if (_.isNil(this.port)) throw new Error('user canceled')

        const info = await this.port.getInfo()
        this.#debug(`port selected, usbVendorId = 0x${u16ToHex(info.usbVendorId)}, usbProductId = 0x${u16ToHex(info.usbProductId)}`)
        this.#isDfu = _.isMatch(info, WEBSERIAL_FILTERS[1])

        // port.open
        await this.port.open({ baudRate: 115200 })
        while (_.isNil(this.port.readable) || _.isNil(this.port.writable)) await sleep(10) // wait for port.readable
        this.#isOpen = true
        this.port.addEventListener('disconnect', () => { void ultra.disconnect(new Error('Webserial disconnect')) })

        if (this.#isDfu) { // Nrf DFU
          ultra.port = {
            isOpen: () => this.#isOpen,
            isDfu: () => this.#isDfu,
            readable: this.port.readable.pipeThrough(new this.#TransformStream(new SlipDecodeTransformer(Buffer1)) as any),
            writable: new this.#WritableStream({
              write: async (chunk: Buffer) => {
                const writer = this.port?.writable?.getWriter()
                if (_.isNil(writer)) throw new Error('Failed to getWriter(). Did you remember to use adapter plugin?')
                await writer.write(slipEncode(chunk, Buffer1) as any)
                writer.releaseLock()
              },
            }),
            dfuWriteObject: async (buf: Buffer, mtu?: number): Promise<void> => {
              if (_.isNil(mtu)) throw new Error('mtu is required')
              const mtu1 = Math.trunc((mtu - 1) / 2) - 1 // mtu before slipEncode
              let chunk: Buffer | undefined
              const writer = this.port?.writable?.getWriter()
              if (_.isNil(writer)) throw new Error('Failed to getWriter(). Did you remember to use adapter plugin?')
              for (const buf1 of buf.chunk(mtu1)) {
                if (chunk?.length !== buf1.length) {
                  chunk = Buffer1.alloc(buf1.length + 1)
                  chunk[0] = DfuOp.OBJECT_WRITE
                }
                chunk.set(buf1, 1)
                await writer.write(slipEncode(chunk, Buffer1) as any)
              }
              writer.releaseLock()
            },
          }
        } else { // ChameleonUltra
          ultra.port = _.merge(this.port, {
            isOpen: () => this.#isOpen,
            isDfu: () => this.#isDfu,
          }) as any
        }
        return await next()
      } catch (err) {
        this.#emitErr(err)
        throw err
      }
    })

    ultra.addHook('disconnect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter || _.isNil(this.port)) return await next() // 代表已經被其他 adapter 接管

      await next().catch(this.#emitErr)
      await this.port.close().catch(this.#emitErr)
      this.#isOpen = false
      this.#isDfu = false
      this.port = null
    })

    return adapter
  }
}

setObject(globalThis, ['ChameleonUltraJS', 'WebserialAdapter'], WebserialAdapter)

enum SlipByte {
  END = 0xC0,
  ESC = 0xDB,
  ESC_END = 0xDC,
  ESC_ESC = 0xDD,
}

class SlipDecodeTransformer implements Transformer<Buffer, Buffer> {
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
function slipEncode (buf: Buffer, Buffer1: typeof Buffer): Buffer {
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
function slipDecode (buf: Buffer): Buffer {
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

type SerialPort1 = SerialPort & EventEmitter
type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}

interface AdapterInstallResp {
  isSupported: () => boolean
}
