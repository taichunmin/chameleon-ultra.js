import _ from 'lodash'
import { bluetooth } from 'webbluetooth'
import { sleep } from '../helper'
import { type Buffer } from '../buffer'
import { type ChameleonPlugin, type ChameleonSerialPort, type PluginInstallContext, type Logger } from '../ChameleonUltra'
import {
  ReadableStream,
  type ReadableStreamDefaultController,
  type UnderlyingSink,
  type UnderlyingSource,
  WritableStream,
} from 'web-streams-polyfill'

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

    if (!_.isNil(ultra.$adapter)) await ultra.disconnect()
    const adapter: any = {}

    const _isSupported = await bluetooth?.getAvailability() ?? false
    adapter.isSupported = (): boolean => _isSupported

    // connect gatt
    const gattIsConnected = (): boolean => { return this.device?.gatt?.connected ?? false }

    ultra.addHook('connect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      try {
        if (adapter.isSupported() !== true) throw new Error('WebSerial not supported')
        this.device = await bluetooth?.requestDevice({
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
          const primaryServices = _.map(await this.device.gatt?.getPrimaryServices(), 'uuid')
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
        this.device.addEventListener('gattserverdisconnected', () => { void ultra.disconnect() })

        ultra.port = {
          isOpen: () => { return this.isOpen },
          readable: new ReadableStream(this.rxSource),
          writable: new WritableStream(this.txSink),
        } satisfies ChameleonSerialPort<Buffer, Buffer>
        return await next()
      } catch (err) {
        this.logger.webble(`Failed to connect: ${err.message as string}`)
        throw err
      }
    })

    ultra.addHook('disconnect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      this.isOpen = false
      await next()
      if (_.isNil(this.device)) return
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
      delete this.device
    })

    return adapter as AdapterInstallResp
  }
}

type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}

interface AdapterInstallResp {
  isSuppored: () => boolean
}

class ChameleonWebbleAdapterRxSource implements UnderlyingSource<Buffer> {
  adapter: WebbleAdapter
  bufs: Buffer[] = []
  controller?: ReadableStreamDefaultController<Buffer>

  constructor (adapter: WebbleAdapter) { this.adapter = adapter }

  start (controller: ReadableStreamDefaultController<Buffer>): void { this.controller = controller }

  onNotify (event: any): void {
    const buf = this.adapter.Buffer?.from(event?.target?.value?.buffer) as Buffer
    this.adapter.logger.webble(`onNotify = ${buf.toString('hex')}`)
    this.controller?.enqueue(buf)
  }
}

class ChameleonWebbleAdapterTxSink implements UnderlyingSink<Buffer> {
  adapter: WebbleAdapter
  isFirstEsc = true

  constructor (adapter: WebbleAdapter) { this.adapter = adapter }

  async write (chunk: Buffer): Promise<void> {
    if (_.isNil(this.adapter.send)) throw new Error('this.adapter.send can not be null')

    // 20 bytes are left for the attribute data
    // https://stackoverflow.com/questions/38913743/maximum-packet-length-for-bluetooth-le
    for (let i = 0; i < chunk.length; i += 20) {
      const buf = chunk.subarray(i, i + 20)
      this.adapter.logger.webble(`bleWrite = ${buf.toString('hex')}`)
      await this.adapter.send?.writeValueWithoutResponse(buf.buffer)
    }
  }
}
