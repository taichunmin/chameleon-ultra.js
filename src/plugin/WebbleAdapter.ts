import _ from 'lodash'
import { ReadableStream, type ReadableStreamDefaultController, type UnderlyingSink, type UnderlyingSource, WritableStream } from 'node:stream/web'
import { sleep } from '../helper'
import { type bluetooth } from 'webbluetooth'
import { type Buffer } from '@taichunmin/buffer'
import { type ChameleonPlugin, type Logger, type PluginInstallContext } from '../ChameleonUltra'

const bluetooth1: typeof bluetooth = (globalThis as any)?.navigator?.bluetooth
const ReadableStream1: typeof ReadableStream = (globalThis as any)?.ReadableStream ?? ReadableStream
const WritableStream1: typeof WritableStream = (globalThis as any)?.WritableStream ?? WritableStream

const BLESERIAL_FILTERS = [
  { name: 'ChameleonUltra' },
]

const BLESERIAL_UUID = [
  { // ChameleonUltra
    serv: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    send: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    recv: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  },
]

export default class WebbleAdapter implements ChameleonPlugin {
  Buffer?: typeof Buffer
  device?: BluetoothDevice
  isOpen: boolean = false
  logger: Record<string, Logger> = {}
  name = 'adapter'
  recv?: BluetoothRemoteGATTCharacteristic
  rxSource?: ChameleonWebbleAdapterRxSource
  send?: BluetoothRemoteGATTCharacteristic
  serv?: BluetoothRemoteGATTService
  txSink?: ChameleonWebbleAdapterTxSink

  async install (context: AdapterInstallContext, pluginOption: any): Promise<AdapterInstallResp> {
    const { ultra, Buffer } = context
    this.Buffer = Buffer
    this.logger.webble = ultra.createDebugger('webble')

    if (!_.isNil(ultra.$adapter)) await ultra.disconnect(new Error('adapter replaced'))
    const adapter: any = {}

    const _isSupported = await bluetooth1?.getAvailability() ?? false
    adapter.isSupported = (): boolean => _isSupported

    // connect gatt
    const gattIsConnected = (): boolean => { return this.device?.gatt?.connected ?? false }

    ultra.addHook('connect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      try {
        if (adapter.isSupported() !== true) throw new Error('WebSerial not supported')
        this.device = await bluetooth1?.requestDevice({
          filters: BLESERIAL_FILTERS,
          optionalServices: _.uniq(_.map(BLESERIAL_UUID, 'serv')),
        })
        if (_.isNil(this.device)) throw new Error('no device')
        this.logger.webble(`device selected, name = ${this.device.name ?? 'null'}, id = ${this.device.id}`)

        this.rxSource = new ChameleonWebbleAdapterRxSource(this)
        this.txSink = new ChameleonWebbleAdapterTxSink(this)

        for (let i = 0; i < 100; i++) {
          this.logger.webble(`gatt connecting, retry = ${i}`)
          if (!gattIsConnected()) await this.device.gatt?.connect().catch((err: any) => { this.logger.webble(err.message) })

          // find serv, send, recv, ctrl
          // uuid from [bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055) is uppercase
          const primaryServices = _.map(await this.device.gatt?.getPrimaryServices(), serv => _.toLower(serv.uuid))
          this.logger.webble(`primaryServices = ${JSON.stringify(primaryServices)}`)
          for (const uuids of BLESERIAL_UUID) {
            try {
              if (!_.includes(primaryServices, uuids.serv)) continue
              this.serv = await this.device.gatt?.getPrimaryService(uuids.serv)
              this.send = await this.serv?.getCharacteristic(uuids.send)
              this.recv = await this.serv?.getCharacteristic(uuids.recv)
              this.recv?.addEventListener('characteristicvaluechanged', (event: any): void => this.rxSource?.onNotify(event))
              await this.recv?.startNotifications()
            } catch (err) {
              delete this.serv
              delete this.send
              delete this.recv
            }

            if (!_.isNil(this.send) && !_.isNil(this.recv)) {
              this.logger.webble(`gatt connected, serv = ${this.serv?.uuid ?? '?'}, recv = ${this.recv?.uuid ?? '?'}, send = ${this.send?.uuid ?? '?'}'`)
              this.isOpen = true
              break
            }
          }
          if (this.isOpen) break
          await sleep(100)
        }
        if (!this.isOpen) throw new Error('Failed to connect gatt')
        this.device.addEventListener('gattserverdisconnected', () => { void ultra.disconnect(new Error('Webble gattserverdisconnected')) })

        ultra.port = {
          isOpen: () => { return this.isOpen },
          readable: new ReadableStream1(this.rxSource),
          writable: new WritableStream1(this.txSink),
        }
        return await next()
      } catch (err) {
        this.logger.webble(`Failed to connect: ${err.message as string}`)
        throw err
      }
    })

    ultra.addHook('disconnect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter || _.isNil(this.device)) return await next() // 代表已經被其他 adapter 接管

      await next()
      if (!_.isNil(this.recv)) {
        if (gattIsConnected()) await this.recv.stopNotifications()
        delete this.recv
        delete this.rxSource
      }
      if (!_.isNil(this.send)) {
        delete this.send
        delete this.txSink
      }
      if (!_.isNil(this.serv)) delete this.serv
      if (gattIsConnected()) this.device.gatt?.disconnect()
      this.isOpen = false
      delete this.device
    })

    return adapter as AdapterInstallResp
  }
}

;((globalThis as any ?? {}).ChameleonUltraJS ?? {}).WebbleAdapter = WebbleAdapter // eslint-disable-line @typescript-eslint/prefer-optional-chain

type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}

interface AdapterInstallResp {
  isSuppored: () => boolean
}

class ChameleonWebbleAdapterRxSource implements UnderlyingSource<Buffer> {
  #controller?: ReadableStreamDefaultController<Buffer>
  readonly #adapter: WebbleAdapter

  constructor (adapter: WebbleAdapter) { this.#adapter = adapter }

  start (controller: ReadableStreamDefaultController<Buffer>): void { this.#controller = controller }

  onNotify (event: any): void {
    const buf = this.#adapter.Buffer?.fromView((event?.target?.value as DataView))
    this.#adapter.logger.webble(`onNotify = ${buf?.toString('hex')}`)
    this.#controller?.enqueue(buf)
  }
}

class ChameleonWebbleAdapterTxSink implements UnderlyingSink<Buffer> {
  readonly #adapter: WebbleAdapter
  readonly #Buffer: typeof Buffer

  constructor (adapter: WebbleAdapter) {
    this.#adapter = adapter
    if (_.isNil(this.#adapter.Buffer)) throw new Error('this.#adapter.Buffer can not be null')
    this.#Buffer = this.#adapter.Buffer
  }

  async write (chunk: Buffer): Promise<void> {
    if (_.isNil(this.#adapter.send)) throw new Error('this.#adapter.send can not be null')

    // 20 bytes are left for the attribute data
    // https://stackoverflow.com/questions/38913743/maximum-packet-length-for-bluetooth-le
    let buf1: Buffer | null = null
    for (let i = 0; i < chunk.length; i += 20) {
      const buf2 = chunk.subarray(i, i + 20)
      if (_.isNil(buf1) || buf1.length !== buf2.length) buf1 = new this.#Buffer(buf2.length)
      buf1.set(buf2)
      this.#adapter.logger.webble(`bleWrite = ${buf1.toString('hex')}`)
      await this.#adapter.send?.writeValueWithoutResponse(buf1.buffer)
    }
  }
}
