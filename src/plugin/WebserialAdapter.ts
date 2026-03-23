import { type Buffer } from '@taichunmin/buffer'
import * as _ from 'lodash-es'
import { TransformStream, WritableStream } from 'stream/web'
import { serial } from 'web-serial-polyfill'
import { type ChameleonUltra } from '../ChameleonUltra'
import { DfuOp } from '../enums'
import { sleep } from '../helper'
import { setObject } from '../iifeExportHelper'
import { type AdapterInstallResp, type PluginInstallContext, type SerialPort, type UltraPlugin } from '../types'
import { SlipDecodeTransformer, slipEncode } from './SlipEncoder'

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
export default class WebserialAdapter implements UltraPlugin {
  #isDfu: boolean = false
  #isOpen: boolean = false
  name = 'adapter'
  port: SerialPort | null = null
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
    this.#emitErr = (err: Error): void => { this.ultra?.emitter.emit('error', _.set(new Error(err.message), 'cause', err)) }
  }

  #debug (formatter: any, ...args: [] | any[]): void {
    this.ultra?.emitter.emit('debug', 'webserial', formatter, ...args)
  }

  async install (context: PluginInstallContext, pluginOption: any): Promise<AdapterInstallResp> {
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
        this.port = await this.#serial.requestPort({ filters: WEBSERIAL_FILTERS }) as SerialPort
        if (_.isNil(this.port)) throw new Error('user canceled')

        const info = await this.port.getInfo()
        this.#debug(`port selected, usbVendorId = 0x${u16ToHex(info.usbVendorId)}, usbProductId = 0x${u16ToHex(info.usbProductId)}`)
        this.#isDfu = _.isMatch(info, WEBSERIAL_FILTERS[1])

        // port.open
        await this.port.open({ baudRate: 115200 })
        while (_.isNil(this.port.readable) || _.isNil(this.port.writable)) await sleep(10) // wait for port.readable
        this.#isOpen = true
        this.port.addEventListener('disconnect', () => { void ultra.disconnect(new Error('Webserial disconnect')).catch(() => {}) })

        if (this.#isDfu) { // Nrf DFU
          ultra.port = {
            isOpen: () => this.#isOpen,
            isDfu: () => this.#isDfu,
            readable: this.port.readable.pipeThrough(new this.#TransformStream(new SlipDecodeTransformer(Buffer1))),
            writable: new this.#WritableStream({
              write: async (chunk: Buffer) => {
                const writer = this.port?.writable?.getWriter()
                if (_.isNil(writer)) throw new Error('Failed to getWriter(). Did you remember to use adapter plugin?')
                await writer.write(slipEncode(chunk, Buffer1))
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
                await writer.write(slipEncode(chunk, Buffer1))
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
