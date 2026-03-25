import { type Buffer } from '@taichunmin/buffer'
import * as _ from 'lodash-es'
import { SerialPort } from 'serialport'
import { Duplex } from 'stream'
import { type ChameleonUltra } from '../ChameleonUltra'
import { DfuOp } from '../enums'
import { setObject } from '../iifeExportHelper'
import {
  type AdapterInstallResp,
  type PluginInstallContext,
  type SerialPortInfo,
  type SerialPortOption,
  type UltraPlugin,
} from '../types'
import { SlipDecodeTransformer, slipEncode } from './SlipEncoder'

// https://github.com/RfidResearchGroup/ChameleonUltra/blob/main/resource/tools/enter_dfu.py
const SERIALPORT_FILTERS = [
  { vendorId: '6868', productId: '8686' }, // Chameleon Ultra
  { vendorId: '1915', productId: '521f' }, // Chameleon Ultra DFU
]

export default class SerialPortAdapter implements UltraPlugin {
  #isDfu = false
  duplex: SerialPort | null = null
  name = 'adapter'
  portInfo: SerialPortInfo | null = null
  readonly #emitErr: (err: Error) => void
  readonly #TransformStream: typeof TransformStream
  readonly #WritableStream: typeof WritableStream
  ultra?: ChameleonUltra

  constructor () {
    this.#TransformStream = (globalThis as any)?.TransformStream ?? TransformStream
    this.#WritableStream = (globalThis as any)?.WritableStream ?? WritableStream
    this.#emitErr = (err: Error): void => { this.ultra?.emitter.emit('error', _.set(new Error(err.message), 'cause', err)) }
  }

  #debug (formatter: any, ...args: [] | any[]): void {
    this.ultra?.emitter.emit('debug', 'serial', formatter, ...args)
  }

  async install (context: AdapterInstallContext, pluginOption: SerialPortOption = {}): Promise<AdapterInstallResp> {
    const ultra = this.ultra = context.ultra
    const Buffer1 = context.Buffer

    if (!_.isNil(ultra.$adapter)) {
      await ultra.disconnect(new Error('adapter replaced'))
    }

    const adapter: AdapterInstallResp = {
      isSupported: () => !_.isNil(SerialPort),
    }

    ultra.addHook('connect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      try {
        if (!adapter.isSupported()) throw new Error('SerialPort not supported')

        const baudRate = pluginOption?.baudRate ?? 115200
        let path = pluginOption?.path

        const portInfos = _.chain(await SerialPort.list())
          .map<SerialPortInfo>(parsePortInfo)
          .filter(info => _.some(SERIALPORT_FILTERS, filter => _.isMatch(info, filter)))
          .value()
        if (_.isEmpty(portInfos)) throw new Error('device not found')

        if (_.isNil(path)) path = (await (pluginOption.devicePicker ?? devicePickerDefault)?.(portInfos))?.path
        if (_.isNil(path)) throw new Error('device not found')

        const portInfo = this.portInfo = _.find(portInfos, { path }) ?? null
        if (_.isNil(portInfo)) throw new Error('failed to get port info')
        this.#debug(`port selected, path = ${path}, baudRate = ${baudRate}, vendorId = 0x${portInfo.vendorId}, productId = 0x${portInfo.productId}`)
        this.#isDfu = _.isMatch(portInfo, SERIALPORT_FILTERS[1])

        this.duplex = await new Promise<SerialPort>((resolve, reject) => {
          const tmp = new SerialPort({ baudRate, path }, err => { _.isNil(err) ? resolve(tmp) : reject(err) })
        })
        this.duplex?.once('close', () => { void ultra.disconnect(new Error('SerialPort closed')).catch(() => {}) })

        if (this.#isDfu) { // Nrf DFU
          const readableWritablePair = Duplex.toWeb(this.duplex)
          ultra.port = {
            isOpen: () => { return this.duplex?.isOpen ?? false },
            isDfu: () => this.#isDfu,
            readable: readableWritablePair.readable.pipeThrough(new this.#TransformStream(new SlipDecodeTransformer(Buffer1))),
            writable: new this.#WritableStream({
              write: async (chunk: Buffer) => {
                const writer = readableWritablePair?.writable?.getWriter()
                if (_.isNil(writer)) throw new Error('Failed to getWriter(). Did you remember to use adapter plugin?')
                await writer.write(slipEncode(chunk as any, Buffer1))
                writer.releaseLock()
              },
            }),
            dfuWriteObject: async (buf: Buffer, mtu?: number): Promise<void> => {
              if (_.isNil(mtu)) throw new Error('mtu is required')
              const mtu1 = Math.trunc((mtu - 1) / 2) - 1 // mtu before slipEncode
              let chunk: Buffer | undefined
              const writer = readableWritablePair?.writable?.getWriter()
              if (_.isNil(writer)) throw new Error('Failed to getWriter(). Did you remember to use adapter plugin?')
              for (const buf1 of buf.chunk(mtu1)) {
                if (chunk?.length !== buf1.length) {
                  chunk = Buffer1.alloc(buf1.length + 1)
                  chunk[0] = DfuOp.OBJECT_WRITE
                }
                chunk.set(buf1, 1)
                await writer.write(slipEncode(chunk as any, Buffer1))
              }
              writer.releaseLock()
            },
          }
        } else {
          ultra.port = _.merge(Duplex.toWeb(this.duplex), {
            isOpen: () => { return this.duplex?.isOpen ?? false },
            isDfu: () => this.#isDfu,
          })
        }
        return await next()
      } catch (err) {
        this.#debug(err)
        throw err
      }
    })

    ultra.addHook('disconnect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter || _.isNil(this.duplex)) return await next() // 代表已經被其他 adapter 接管

      await next().catch(this.#emitErr)
      await new Promise<void>((resolve, reject) => {
        this.duplex?.close(err => { _.isNil(err) ? resolve() : reject(err) })
      }).catch(this.#emitErr)
      this.#isDfu = false
      this.duplex = null
    })

    return adapter
  }
}

async function devicePickerDefault (infos: SerialPortInfo[]): Promise<SerialPortInfo | undefined> {
  return (_.find(infos, SERIALPORT_FILTERS[1]) ?? _.find(infos, SERIALPORT_FILTERS[0])) as any
}

function parsePortInfo ({ vendorId, productId, ...others }: SerialPortInfo): SerialPortInfo {
  return {
    ...others,
    vendorId: _.isNil(vendorId) ? undefined : _.toLower(vendorId),
    productId: _.isNil(productId) ? undefined : _.toLower(productId),
  }
}

export async function listDevices (): Promise<SerialPortInfo[]> {
  return _.chain(await SerialPort.list())
    .map<SerialPortInfo>(parsePortInfo)
    .filter(info => _.some(SERIALPORT_FILTERS, filter => _.isMatch(info, filter)))
    .value()
}

setObject(globalThis, ['ChameleonUltraJS', 'SerialPortAdapter'], SerialPortAdapter)

/** @inline */
type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}
