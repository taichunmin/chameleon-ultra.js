import { type Buffer } from '@taichunmin/buffer'
import _ from 'lodash'
import { TransformStream, type UnderlyingSink, WritableStream } from 'node:stream/web'
import { type bluetooth } from 'webbluetooth'
import { type ChameleonPlugin, type ChameleonSerialPort, type ChameleonUltra, type PluginInstallContext } from '../ChameleonUltra'
import { sleep } from '../helper'
import { setObject } from '../iifeExportHelper'

const DFU_SERV_UUID_16 = 0xFE59
const DFU_CTRL_CHAR_UUID = toCanonicalUUID('8ec90001-f315-4f60-9fb8-838830daea50')
const DFU_PACKT_CHAR_UUID = toCanonicalUUID('8ec90002-f315-4f60-9fb8-838830daea50')
const DFU_SERV_UUID = toCanonicalUUID(DFU_SERV_UUID_16)
const ULTRA_RX_CHAR_UUID = toCanonicalUUID('6e400002-b5a3-f393-e0a9-e50e24dcca9e')
const ULTRA_SERV_UUID = toCanonicalUUID('6e400001-b5a3-f393-e0a9-e50e24dcca9e')
const ULTRA_TX_CHAR_UUID = toCanonicalUUID('6e400003-b5a3-f393-e0a9-e50e24dcca9e')

const BLE_SCAN_FILTERS: BluetoothLEScanFilter[] = [
  { name: 'ChameleonUltra' }, // Chameleon Ultra
  { namePrefix: 'CU-' }, // Chameleon Ultra DFU
  { services: [DFU_SERV_UUID_16] }, // Chameleon Ultra DFU
  { services: [DFU_SERV_UUID] }, // Chameleon Ultra DFU
  { services: [ULTRA_SERV_UUID] }, // Chameleon Ultra, bluefy not support name filter
]

export default class WebbleAdapter implements ChameleonPlugin {
  #isOpen: boolean = false
  bluetooth?: typeof bluetooth
  Buffer?: typeof Buffer
  ctrlChar?: BluetoothRemoteGATTCharacteristic
  device?: BluetoothDevice
  emitErr: (err: Error) => void
  name = 'adapter'
  packtChar?: BluetoothRemoteGATTCharacteristic
  port?: ChameleonSerialPort
  rxChar?: BluetoothRemoteGATTCharacteristic
  TransformStream: typeof TransformStream
  ultra?: ChameleonUltra
  WritableStream: typeof WritableStream

  constructor () {
    const navigator = (globalThis as any)?.navigator ?? {}
    this.bluetooth = navigator?.bluetooth
    this.WritableStream = (globalThis as any)?.WritableStream ?? WritableStream
    this.TransformStream = (globalThis as any)?.TransformStream ?? TransformStream
    this.emitErr = (err: Error): void => { this.ultra?.emitter.emit('error', _.set(new Error(err.message), 'originalError', err)) }
  }

  #debug (formatter: any, ...args: [] | any[]): void {
    this.ultra?.emitter.emit('debug', 'webble', formatter, ...args)
  }

  async install (context: AdapterInstallContext, pluginOption: any): Promise<AdapterInstallResp> {
    const { ultra, Buffer } = context
    ;[this.ultra, this.Buffer] = [ultra, Buffer]

    if (!_.isNil(ultra.$adapter)) await ultra.disconnect(new Error('adapter replaced'))
    const _isSupported = await this.bluetooth?.getAvailability() ?? false
    const adapter: AdapterInstallResp = {
      isSupported: (): boolean => _isSupported,
    }

    // connect gatt
    const gattIsConnected = (): boolean => { return this.device?.gatt?.connected ?? false }

    ultra.addHook('connect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      try {
        if (!adapter.isSupported()) throw new Error('WebBLE not supported')
        this.device = await this.bluetooth?.requestDevice({
          filters: BLE_SCAN_FILTERS,
          optionalServices: [DFU_SERV_UUID, DFU_SERV_UUID_16, ULTRA_SERV_UUID],
        }).catch(err => { throw _.set(new Error(err.message), 'originalError', err) })
        if (_.isNil(this.device)) throw new Error('no device')
        this.device.addEventListener('gattserverdisconnected', () => { void ultra.disconnect(new Error('WebBLE gattserverdisconnected')) })
        this.#debug(`device selected, name = ${this.device.name ?? 'null'}, id = ${this.device.id}`)

        for (let i = 0; i < 100; i++) {
          if (gattIsConnected()) break
          await this.device.gatt?.connect().catch(this.emitErr)
          await sleep(100)
        }
        if (!gattIsConnected()) throw new Error('Failed to connect gatt')

        const servs = new Map(_.map((await this.device?.gatt?.getPrimaryServices()) ?? [], serv => [toCanonicalUUID(serv.uuid), serv]))
        this.#debug(`gattServUuids = ${JSON.stringify([...servs.keys()])}`)

        const txStream = new this.TransformStream()
        const txStreamOnNotify = async (event: any): Promise<void> => {
          const dv = event?.target?.value
          if (!ArrayBuffer.isView(dv)) return
          const writer = txStream.writable.getWriter()
          if (_.isNil(writer)) throw new Error('Failed to get txStream writer')
          await writer.write(this.Buffer?.fromView(dv))
          writer.releaseLock()
        }
        if (servs.has(ULTRA_SERV_UUID)) {
          this.port = {
            isOpen: () => this.#isOpen,
            readable: txStream.readable,
            writable: new this.WritableStream(new UltraRxSink(this)),
          }
          const serv = servs.get(ULTRA_SERV_UUID)
          if (_.isNil(serv)) throw new Error(`Failed to find gatt serv, uuid = ${ULTRA_SERV_UUID}`)
          const chars = new Map(_.map((await serv.getCharacteristics()) ?? [], char => [toCanonicalUUID(char.uuid), char]))
          this.#debug(`gattCharUuids = ${JSON.stringify([...chars.keys()])}`)

          this.rxChar = chars.get(ULTRA_RX_CHAR_UUID)
          if (_.isNil(this.rxChar)) throw new Error(`Failed to find rxChar, uuid = ${ULTRA_TX_CHAR_UUID}`)
          const txChar = chars.get(ULTRA_TX_CHAR_UUID)
          if (_.isNil(txChar)) throw new Error(`Failed to find txChar, uuid = ${ULTRA_RX_CHAR_UUID}`)
          txChar.addEventListener('characteristicvaluechanged', txStreamOnNotify)
          await txChar.startNotifications()
          this.#isOpen = true
        } else if (servs.has(DFU_SERV_UUID)) {
          this.port = {
            isOpen: () => this.#isOpen,
            isDfu: () => true,
            readable: txStream.readable,
            writable: new this.WritableStream(new DfuRxSink(this)),
            dfuWriteObject: async (buf: Buffer, mtu?: number): Promise<void> => {
              if (_.isNil(this.packtChar) || _.isNil(this.Buffer)) throw new Error('this.#adapter.packtChar can not be null')
              let chunk: Buffer | undefined
              for (const buf1 of buf.chunk(20)) {
                if (chunk?.length !== buf1.length) chunk = new this.Buffer(buf1.length)
                chunk.set(buf1)
                await this.packtChar.writeValueWithoutResponse(chunk.buffer)
                await sleep(5) // wait for data to be processed
              }
            },
          }
          const serv = servs.get(DFU_SERV_UUID)
          if (_.isNil(serv)) throw new Error(`Failed to find gatt serv, uuid = ${DFU_SERV_UUID}`)
          const chars = new Map(_.map((await serv.getCharacteristics()) ?? [], char => [toCanonicalUUID(char.uuid), char]))
          this.#debug(`gattCharUuids = ${JSON.stringify([...chars.keys()])}`)

          this.packtChar = chars.get(DFU_PACKT_CHAR_UUID)
          if (_.isNil(this.packtChar)) throw new Error(`Failed to find packtChar, uuid = ${DFU_PACKT_CHAR_UUID}`)
          const ctrlChar = this.ctrlChar = chars.get(DFU_CTRL_CHAR_UUID)
          if (_.isNil(ctrlChar)) throw new Error(`Failed to find ctrlChar, uuid = ${DFU_CTRL_CHAR_UUID}`)
          ctrlChar.addEventListener('characteristicvaluechanged', txStreamOnNotify)
          await ctrlChar.startNotifications()
          this.#isOpen = true
        }

        if (!this.#isOpen) throw new Error('Failed to find supported service')
        ultra.port = this.port
        return await next()
      } catch (err) {
        this.emitErr(err)
        throw err
      }
    })

    ultra.addHook('disconnect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter || _.isNil(this.device)) return await next() // 代表已經被其他 adapter 接管

      await next()
      this.#isOpen = false
      delete this.port
      delete this.rxChar
      delete this.ctrlChar
      delete this.packtChar
      if (gattIsConnected()) this.device.gatt?.disconnect()
      delete this.device
    })

    return adapter
  }
}

setObject(globalThis, ['ChameleonUltraJS', 'WebbleAdapter'], WebbleAdapter)

type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}

interface AdapterInstallResp {
  isSupported: () => boolean
}

class UltraRxSink implements UnderlyingSink<Buffer> {
  readonly #adapter: WebbleAdapter
  Buffer: typeof Buffer

  constructor (adapter: WebbleAdapter) {
    this.#adapter = adapter
    if (_.isNil(this.#adapter.Buffer)) throw new Error('this.#adapter.Buffer can not be null')
    this.Buffer = this.#adapter.Buffer
  }

  #debug (formatter: any, ...args: [] | any[]): void {
    this.#adapter.ultra?.emitter.emit('debug', 'webble', formatter, ...args)
  }

  async write (chunk: Buffer): Promise<void> {
    try {
      if (_.isNil(this.#adapter.rxChar)) throw new Error('this.#adapter.rxChar can not be null')

      // 20 bytes are left for the attribute data
      // https://stackoverflow.com/questions/38913743/maximum-packet-length-for-bluetooth-le
      let buf2: Buffer | null = null
      for (const buf1 of chunk.chunk(20)) {
        if (!this.Buffer.isBuffer(buf2) || buf1.length !== buf2.length) buf2 = new this.Buffer(buf1.length)
        buf2.set(buf1)
        this.#debug(`bleWrite = ${buf2.toString('hex')}`)
        await this.#adapter.rxChar.writeValueWithoutResponse(buf2.buffer)
      }
    } catch (err) {
      this.#adapter.emitErr(err)
      throw err
    }
  }
}

class DfuRxSink implements UnderlyingSink<Buffer> {
  readonly #adapter: WebbleAdapter
  Buffer: typeof Buffer

  constructor (adapter: WebbleAdapter) {
    this.#adapter = adapter
    if (_.isNil(this.#adapter.Buffer)) throw new Error('this.#adapter.Buffer can not be null')
    this.Buffer = this.#adapter.Buffer
  }

  #debug (formatter: any, ...args: [] | any[]): void {
    this.#adapter.ultra?.emitter.emit('debug', 'webble', formatter, ...args)
  }

  async write (chunk: Buffer): Promise<void> {
    try {
      if (chunk.length !== chunk.buffer.byteLength) chunk = chunk.slice()
      if (_.isNil(this.#adapter.ctrlChar)) throw new Error('this.#adapter.ctrlChar can not be null')
      if (chunk.length > 20) throw new Error('chunk.length > 20 (BLE MTU)')
      this.#debug(`bleWrite = ${chunk.toString('hex')}`)
      await this.#adapter.ctrlChar.writeValueWithResponse(chunk.buffer)
    } catch (err) {
      this.#adapter.emitErr(err)
      throw err
    }
  }
}

type BluetoothServiceUUID = number | string

interface BluetoothManufacturerDataFilter<T = Buffer> extends BluetoothDataFilter<T> {
  companyIdentifier: number
}

interface BluetoothServiceDataFilter<T = Buffer> extends BluetoothDataFilter<T> {
  service: BluetoothServiceUUID
}

interface BluetoothDataFilter<T = Buffer> {
  readonly dataPrefix?: T | undefined
  readonly mask?: T | undefined
}

interface BluetoothLEScanFilter<T = Buffer> {
  readonly name?: string | undefined
  readonly namePrefix?: string | undefined
  readonly services?: BluetoothServiceUUID[] | undefined
  readonly manufacturerData?: Array<BluetoothManufacturerDataFilter<T>> | undefined
  readonly serviceData?: Array<BluetoothServiceDataFilter<T>> | undefined
}

function toCanonicalUUID (uuid: any): string {
  return _.toLower(_.isInteger(uuid) ? BluetoothUUID.canonicalUUID(uuid) : uuid)
}
