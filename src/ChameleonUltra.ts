import { Buffer } from '@taichunmin/buffer'
import crc16a from '@taichunmin/crc/crc16a'
import crc32 from '@taichunmin/crc/crc32'
import _ from 'lodash'
import { type ReadableStream, type UnderlyingSink, type WritableStreamDefaultController, WritableStream } from 'node:stream/web'
import {
  type AnimationMode,
  type ButtonAction,
  type ButtonType,
  type DarksideStatus,
  type DeviceModel,
  type DfuFwId,
  type DfuFwType,
  type FreqType,
  type Mf1EmuWriteMode,
  type Mf1PrngType,
  type Mf1VblockOperator,
  type Slot,
  Cmd,
  DeviceMode,
  DfuObjType,
  DfuOp,
  DfuResCode,
  isAnimationMode,
  isButtonAction,
  isButtonType,
  isDeviceMode,
  isDfuFwId,
  isFailedRespStatus,
  isMf1EmuWriteMode,
  isMf1KeyType,
  isMf1VblockOperator,
  isMfuEmuTagType,
  isSlot,
  isTagType,
  isValidDfuObjType,
  isValidFreqType,
  Mf1KeyType,
  MfuCmd,
  MfuVerToMfuTagType,
  MfuTagType,
  RespStatus,
  TagType,
} from './enums'
import { EventAsyncGenerator } from './EventAsyncGenerator'
import { EventEmitter } from './EventEmitter'
import { type MiddlewareComposeFn, middlewareCompose, sleep, versionCompare } from './helper'
import { type DfuImage } from './plugin/DfuZip'
import * as Decoder from './ResponseDecoder'

const READ_DEFAULT_TIMEOUT = 5e3
const START_OF_FRAME = new Buffer(2).writeUInt16BE(0x11EF)
const VERSION_SUPPORTED = { gte: '2.0', lt: '3.0' } as const

function isMf1BlockNo (block: any): boolean {
  return _.isInteger(block) && block >= 0 && block <= 0xFF
}

function validateMf1BlockKey (block: any, keyType: any, key: any, prefix: string = ''): void {
  if (!isMf1BlockNo(block)) throw new TypeError(`${prefix}block should be a integer`)
  if (!isMf1KeyType(keyType)) throw new TypeError(`${prefix}keyType should be a Mf1KeyType`)
  bufIsLenOrFail(key, 6, `${prefix}key`)
}

function toUpperHex (buf: Buffer): string {
  return _.toUpper(buf.toString('hex'))
}

/**
 * The core library of `chameleon-ultra.js`. You need to register exactly one adapter to the `ChameleonUltra` instance.
 *
 * @see You can learn how to use `@taichunmin/buffer` from {@link https://taichunmin.idv.tw/js-buffer/ | here}.
 * @example
 * <details>
 * <summary>Click here to expend import example.</summary>
 *
 * Example of import the library using `import` or `require`:
 *
 * ```js
 * // import
 * import { Buffer, ChameleonUltra } from 'chameleon-ultra.js'
 * import SerialPortAdapter from 'chameleon-ultra.js/plugin/SerialPortAdapter'
 * import WebbleAdapter from 'chameleon-ultra.js/plugin/WebbleAdapter'
 * import WebserialAdapter from 'chameleon-ultra.js/plugin/WebserialAdapter'
 *
 * // require
 * const { Buffer, ChameleonUltra } = require('chameleon-ultra.js')
 * const SerialPortAdapter = require('chameleon-ultra.js/plugin/SerialPortAdapter')
 * const WebbleAdapter = require('chameleon-ultra.js/plugin/WebbleAdapter')
 * const WebserialAdapter = require('chameleon-ultra.js/plugin/WebserialAdapter')
 * ```
 *
 * Example of import the library in Browser (place at the end of body):
 *
 * ```html
 * <!-- script -->
 * <script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/index.global.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.global.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/plugin/WebbleAdapter.global.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/plugin/WebserialAdapter.global.js"></script>
 * <script>
 *   const { Buffer, ChameleonUltra, WebbleAdapter, WebserialAdapter } = window.ChameleonUltraJS
 * </script>
 *
 * <!-- module -->
 * <script type="module">
 *   import { Buffer, ChameleonUltra } from 'https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm'
 *   import WebbleAdapter from 'https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/plugin/WebbleAdapter.mjs/+esm'
 *   import WebserialAdapter from 'https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/plugin/WebserialAdapter.mjs/+esm'
 * </script>
 *
 * <!-- module + async import -->
 * <script type="module">
 *   const { Buffer, ChameleonUltra } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
 *   const { default: WebbleAdapter } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/plugin/WebbleAdapter.mjs/+esm')
 *   const { default: WebserialAdapter } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/plugin/WebserialAdapter.mjs/+esm')
 * </script>
 * ```
 *
 * After importing the SDK, you need to register exactly one adapter to the `ChameleonUltra` instance:
 *
 * ```js
 * const ultraUsb = new ChameleonUltra()
 * ultraUsb.use(new WebserialAdapter())
 * const ultraBle = new ChameleonUltra()
 * ultraBle.use(new WebbleAdapter())
 * ```
 *
 * </details>
 */
export class ChameleonUltra {
  readonly #emitErr: (err: Error) => void
  #deviceMode: DeviceMode | null = null
  #isDisconnecting: boolean = false
  #rxSink?: UltraRxSink | DfuRxSink
  #supportedCmds: Set<Cmd> = new Set<Cmd>()
  readonly #hooks = new Map<string, ReturnType<typeof middlewareCompose>>()
  readonly #middlewares = new Map<string, MiddlewareComposeFn[]>()
  readonly #WritableStream: typeof WritableStream

  /**
   * The supported version of SDK.
   * @group Device Related
   */
  static VERSION_SUPPORTED = VERSION_SUPPORTED

  /**
   * @hidden
   */
  readDefaultTimeout: number = READ_DEFAULT_TIMEOUT

  /**
   * The event emitter of `ChameleonUltra`.
   * - `disconnected`: Emitted when device is disconnected.
   * - `connected`: Emitted when device is connected.
   * - `debug`: Emitted when debug message is generated. `(logName: string, formatter: any, ...args: [] | any[]) => void`
   * @hidden
   */
  readonly emitter = new EventEmitter()

  /**
   * @hidden
   */
  port?: ChameleonSerialPort<Buffer, Buffer>

  constructor () {
    this.#WritableStream = (globalThis as any)?.WritableStream ?? WritableStream
    this.#emitErr = (err: Error): void => { this.emitter.emit('error', _.set(new Error(err.message), 'originalError', err)) }
  }

  #debug (namespace: string, formatter: any, ...args: [] | any[]): void {
    this.emitter.emit('debug', namespace, formatter, ...args)
  }

  /**
   * Register a plugin.
   * @param plugin - The plugin to register.
   * @param option - The option to pass to plugin.install().
   * @internal
   * @group Internal
   */
  async use (plugin: ChameleonPlugin, option?: any): Promise<this> {
    const pluginId = `$${plugin.name}`
    const installResp = await plugin.install({ Buffer, ultra: this }, option)
    if (!_.isNil(installResp)) (this as Record<string, any>)[pluginId] = installResp
    return this
  }

  /**
   * Register a hook.
   * @param hookName - The hook name.
   * @param fn - The function to register.
   * @internal
   * @group Internal
   */
  addHook (hookName: string, fn: MiddlewareComposeFn): this {
    const middlewares = this.#middlewares.get(hookName) ?? []
    if (!this.#middlewares.has(hookName)) this.#middlewares.set(hookName, middlewares)
    middlewares.push(fn)
    this.#hooks.set(hookName, middlewareCompose(middlewares))
    return this
  }

  /**
   * Invoke a hook with context.
   * @param hookName - The hook name.
   * @param ctx - The context will be passed to every middleware.
   * @param next - The next middleware function.
   * @returns The return value depent on the middlewares
   * @internal
   * @group Internal
   */
  async invokeHook (hookName: string, ctx: any = {}, next?: MiddlewareComposeFn): Promise<unknown> {
    const hook = this.#hooks.get(hookName) ?? middlewareCompose([])
    if (!this.#hooks.has(hookName)) this.#hooks.set(hookName, hook)
    return await hook({ ...ctx, ultra: this }, next)
  }

  /**
   * Connect to ChameleonUltra. This method will be called automatically when you call any command.
   * @group Connection Related
   */
  async connect (): Promise<void> {
    try {
      await this.invokeHook('connect', {}, async (ctx, next) => {
        if (_.isNil(this.port)) throw new Error('this.port is undefined. Did you remember to use adapter plugin?')

        // serial.readable pipeTo this.rxSink
        const promiseConnected = new Promise<Date>(resolve => this.emitter.once('connected', resolve))
        this.#rxSink = this.isDfu() ? new DfuRxSink(this) : new UltraRxSink(this)
        void this.port.readable.pipeTo(new this.#WritableStream(this.#rxSink), this.#rxSink.abortController)
          .catch(err => { this.#debug('rxSink', err) })

        const connectedAt = await promiseConnected
        this.#debug('core', `connected at ${connectedAt.toISOString()}`)
      })
    } catch (err) {
      const err1 = _.set(new Error(`Failed to connect: ${err.message}`), 'originalError', err)
      this.#emitErr(err1)
      await this.disconnect(err1)
      throw err1
    }
  }

  /**
   * Disconnect ChameleonUltra.
   * @group Connection Related
   */
  async disconnect (err: Error = new Error('disconnect()')): Promise<void> {
    try {
      if (this.#isDisconnecting) return
      this.#isDisconnecting = true // 避免重複執行
      this.emitter.emit('error', err)
      this.#debug('core', 'disconnecting...')
      await this.invokeHook('disconnect', { err }, async (ctx, next) => {
        try {
          // clean up
          this.#deviceMode = null
          this.#supportedCmds.clear()

          const promiseDisconnected: Promise<[Date, string | undefined]> = this.isConnected() ? new Promise(resolve => {
            this.emitter.once('disconnected', (disconnected: Date, reason?: string) => { resolve([disconnected, reason]) })
          }) : Promise.resolve([new Date(), err.message])
          const isLocked = (): boolean => this.port?.readable?.locked ?? false
          if (isLocked()) this.#rxSink?.abortController.abort(err)
          while (isLocked()) await sleep(10)
          await this.port?.readable?.cancel(err).catch(this.#emitErr)
          await this.port?.writable?.close().catch(this.#emitErr)
          delete this.port

          const [disconnectedAt, reason] = await promiseDisconnected
          this.#debug('core', `disconnected at ${disconnectedAt.toISOString()}, reason = ${reason ?? '?'}`)
        } catch (err) {
          throw _.merge(new Error(err.message ?? 'Failed to disconnect'), { originalError: err })
        }
      })
    } finally {
      this.#isDisconnecting = false
    }
  }

  /**
   * Return true if ChameleonUltra is connected.
   * @group Connection Related
   */
  isConnected (): boolean {
    return this?.port?.isOpen?.() ?? false
  }

  /**
   * Return true if ChameleonUltra is in DFU mode.
   * @group DFU Related
   */
  isDfu (): boolean {
    return this?.port?.isDfu?.() ?? false
  }

  /**
   * Return true if DFU use slip encode/decode.
   * @group DFU Related
   * @see Please refer to [SLIP](https://en.wikipedia.org/wiki/Serial_Line_Internet_Protocol) and [nRF5 SDK: SLIP library](https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_slip.html) for more information.
   */
  isSlip (): boolean {
    return this?.port?.isSlip?.() ?? false
  }

  /**
   * Send a buffer to device.
   * @param buf - The buffer to be sent to device.
   * @internal
   * @group Internal
   */
  async #sendBuffer (buf: Buffer): Promise<void> {
    if (!Buffer.isBuffer(buf)) throw new TypeError('buf must be a Buffer')
    if (!this.isConnected()) await this.connect()
    const frame = this.isDfu() ? new DfuFrame(buf) : new UltraFrame(buf)
    if (!(frame instanceof DfuFrame) || frame.op !== DfuOp.OBJECT_WRITE) this.#debug('send', frame.inspect)
    const writer = (this.port?.writable as any)?.getWriter()
    if (_.isNil(writer)) throw new Error('Failed to getWriter(). Did you remember to use adapter plugin?')
    await writer.write(buf)
    writer.releaseLock()
  }

  /**
   * Send a command to device.
   * @param opts.cmd - The command to be sent to device.
   * @param opts.status - The status is always `0x0000`.
   * @param opts.data - `<= 512 bytes`, the data to be sent. This payload depends on the exact command being used. See [Packet payloads](https://github.com/RfidResearchGroup/ChameleonUltra/blob/main/docs/protocol.md#packet-payloads) for more infomation.
   * @internal
   * @group Internal
   */
  async #sendCmd (opts: {
    cmd: Cmd
    status?: RespStatus
    data?: Buffer
  }): Promise<void> {
    const { cmd, status = 0, data = Buffer.allocUnsafe(0) } = opts
    const buf = Buffer.pack(`!2sHHHx${data.length}sx`, START_OF_FRAME, cmd, status, data.length, data)
    buf[8] = bufLrc(buf.subarray(2, 8)) // head lrc byte
    buf[buf.length - 1] = bufLrc(buf.subarray(9, -1)) // lrc of buf
    await this.#sendBuffer(buf)
  }

  /**
   * Read a response from device.
   * @param args.timeout - The timeout in milliseconds.
   * @internal
   * @group Internal
   */
  async #createReadRespFn <T extends UltraFrame | DfuFrame> (args: {
    cmd?: Cmd
    op?: DfuOp
    filter?: (resp: T) => boolean
    timeout?: number
  }): Promise<() => Promise<T>> {
    try {
      if (!this.isConnected()) await this.connect()
      if (_.isNil(this.#rxSink)) throw new Error('rxSink is undefined')
      if (_.isNil(args.timeout)) args.timeout = this.readDefaultTimeout
      const respGenerator = new EventAsyncGenerator<T>()
      this.emitter.on('resp', respGenerator.onData)
      this.emitter.once('disconnected', respGenerator.onClose)
      let timeout: NodeJS.Timeout | undefined
      respGenerator.removeCallback = () => {
        this.emitter.removeListener('resp', respGenerator.onData)
        this.emitter.removeListener('disconnected', respGenerator.onClose)
        if (!_.isNil(timeout)) {
          clearTimeout(timeout)
          timeout = undefined // prevent memory leak: https://lucumr.pocoo.org/2024/6/5/node-timeout/
        }
      }
      return async () => {
        timeout = setTimeout(() => {
          respGenerator.onError(new Error(`read resp timeout (${args.timeout}ms)`))
        }, args.timeout)
        let resp: T | null = null
        for await (const resp1 of respGenerator) {
          if (!_.isNil(args.cmd) && (resp1 as UltraFrame).cmd !== args.cmd) continue
          if (!_.isNil(args.op) && (resp1 as DfuFrame).op !== args.op) continue
          if (!(args.filter?.(resp1) ?? true)) continue
          if (resp1.errMsg) {
            this.#debug('respError', resp1.inspect)
            throw _.merge(new Error(resp1.errMsg), {
              data: { resp1 },
              ...(resp1 instanceof UltraFrame ? { status: resp1.status } : { status: resp1.result }),
            })
          }
          this.#debug('resp', resp1.inspect)
          resp = resp1
          break
        }
        if (_.isNil(resp)) throw new Error('device disconnected')
        return resp
      }
    } catch (err) {
      this.emitter.emit('error', err)
      throw err
    }
  }

  /**
   * Get current firmware version of device.
   * @returns Current firmware version of device.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdGetAppVersion()) // '1.0'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetAppVersion (): Promise<`${number}.${number}`> {
    const cmd = Cmd.GET_APP_VERSION // cmd = 1000
    const readResp = await this.#createReadRespFn<UltraFrame>({ cmd })
    await this.#sendCmd({ cmd })
    const { status, data } = await readResp()
    if (status === RespStatus.HF_TAG_OK && data.readUInt16BE(0) === 0x0001) throw new Error('Unsupported protocol. Firmware update is required.')
    return `${data[0]}.${data[1]}`
  }

  /**
   * Change device mode to tag reader or tag emulator.
   * @param mode - The mode to be changed.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { DeviceMode } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdChangeDeviceMode(DeviceMode.TAG)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdChangeDeviceMode (mode: DeviceMode): Promise<void> {
    if (!isDeviceMode(mode)) throw new TypeError('Invalid device mode')
    const cmd = Cmd.CHANGE_DEVICE_MODE // cmd = 1001
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!B', mode) })
    await readResp()
    this.#deviceMode = mode
  }

  /**
   * Get current mode of device.
   * @returns Current mode of device.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { DeviceMode } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const deviceMode = await ultra.cmdGetDeviceMode()
   *   console.log(DeviceMode[deviceMode]) // 'TAG'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetDeviceMode (): Promise<DeviceMode> {
    const cmd = Cmd.GET_DEVICE_MODE // cmd = 1002
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    const data = (await readResp()).data
    this.#deviceMode = data[0]
    return this.#deviceMode
  }

  /**
   * Automatically change the device mode to `mode` if the current device mode is not equal to `mode`.
   * @group Device Related
   */
  async assureDeviceMode (mode: DeviceMode): Promise<void> {
    if (this.#deviceMode === mode) return
    await this.cmdChangeDeviceMode(mode)
  }

  /**
   * Change the active emulation tag slot of device.
   * @param slot - The slot to be active.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdSlotSetActive(Slot.SLOT_1)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotSetActive (slot: Slot): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    const cmd = Cmd.SET_ACTIVE_SLOT // cmd = 1003
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!B', slot) })
    await readResp()
  }

  /**
   * Change the emulation tag type of specified slot.
   * @param slot - The slot to be set.
   * @param tagType - The tag type to be set.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, TagType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdSlotChangeTagType(Slot.SLOT_1, TagType.MIFARE_1024)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotChangeTagType (slot: Slot, tagType: TagType): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isTagType(tagType)) throw new TypeError('Invalid tagType')
    const cmd = Cmd.SET_SLOT_TAG_TYPE // cmd = 1004
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BH', slot, tagType) })
    await readResp()
  }

  /**
   * Reset the emulation tag data of specified tag type in specified slot to default values.
   * @param slot - The slot to be reset.
   * @param tagType - The tag type to be reset.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, TagType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdSlotResetTagType(Slot.SLOT_1, TagType.MIFARE_1024)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotResetTagType (slot: Slot, tagType: TagType): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isTagType(tagType)) throw new TypeError('Invalid tagType')
    const cmd = Cmd.SET_SLOT_DATA_DEFAULT // cmd = 1005
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BH', slot, tagType) })
    await readResp()
  }

  /**
   * Enable or disable the specified slot.
   * @param slot - The slot to be enable/disable.
   * @param enable - `true` to enable the slot, `false` to disable the slot.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { FreqType, Slot } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdSlotSetEnable(Slot.SLOT_1, FreqType.HF, true)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotSetEnable (slot: Slot, freq: FreqType, enable: boolean | number): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isValidFreqType(freq)) throw new TypeError('Invalid freq')
    if (_.isNil(enable)) throw new TypeError('enable is required')
    const cmd = Cmd.SET_SLOT_ENABLE // cmd = 1006
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB?', slot, freq, enable) })
    await readResp()
  }

  /**
   * Set the nickname of specified freq type in specified slot.
   * @param slot - The slot to be set.
   * @param freq - The freq type to be set.
   * @param name - The name to be set. The `byteLength` of name should between `1` and `32`.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, FreqType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdSlotSetFreqName(Slot.SLOT_1, FreqType.HF, 'My Tag')
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotSetFreqName (slot: Slot, freq: FreqType, name: string): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isValidFreqType(freq)) throw new TypeError('Invalid freq')
    if (!_.isString(name)) throw new TypeError('name should be a string')
    const buf1 = Buffer.from(name)
    if (!_.inRange(buf1.length, 1, 33)) throw new TypeError('byteLength of name should between 1 and 32')
    const cmd = Cmd.SET_SLOT_TAG_NICK // cmd = 1007
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack(`!BB${buf1.length}s`, slot, freq, buf1) })
    await readResp()
  }

  /**
   * Get the nickname of specified freq type in specified slot.
   * @param slot - The slot to be get.
   * @param freq - The freq type to be get.
   * @returns The nickname of specified freq type in specified slot.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, FreqType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const name = await ultra.cmdSlotGetFreqName(Slot.SLOT_1, FreqType.HF)
   *   console.log(name) // 'My Tag'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotGetFreqName (slot: Slot, freq: FreqType): Promise<string | undefined> {
    try {
      if (!isSlot(slot)) throw new TypeError('Invalid slot')
      if (!isValidFreqType(freq)) throw new TypeError('Invalid freq')
      const cmd = Cmd.GET_SLOT_TAG_NICK // cmd = 1008
      const readResp = await this.#createReadRespFn({ cmd })
      await this.#sendCmd({ cmd, data: Buffer.pack('!BB', slot, freq) })
      return (await readResp()).data.toString('utf8')
    } catch (err) {
      if (err.status === RespStatus.FLASH_READ_FAIL) return // slot name is empty
      throw err
    }
  }

  /**
   * The SlotSettings, hf tag data and lf tag data will be written to persistent storage. But the slot nickname is not affected by this command.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdMf1EmuWriteBlock(1, Buffer.alloc(16))
   *   await ultra.cmdSlotSaveSettings()
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotSaveSettings (): Promise<void> {
    const cmd = Cmd.SLOT_DATA_CONFIG_SAVE // cmd = 1009
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    await readResp()
  }

  /**
   * Enter bootloader mode.
   * @group DFU Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdDfuEnter()
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdDfuEnter (): Promise<void> {
    const cmd = Cmd.ENTER_BOOTLOADER // cmd = 1010
    await this.#sendCmd({ cmd })
    for (let i = 500; i >= 0; i--) {
      if (!this.isConnected()) break
      if (i === 0) throw new Error('Failed to enter bootloader mode')
      await sleep(10)
    }
    this.#debug('core', 'cmdDfuEnter: device disconnected')
  }

  /**
   * Get chipset id of device in hex format.
   * @returns Chipset id of device in hex format.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdGetDeviceChipId()) // 'db1c624228d9634c'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetDeviceChipId (): Promise<string> {
    const cmd = Cmd.GET_DEVICE_CHIP_ID // cmd = 1011
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    const data = (await readResp()).data
    return data.toString('hex')
  }

  /**
   * Get the ble address of device.
   * @returns The ble address of device.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdBleGetAddress()) // 'E8:B6:3D:04:B6:FE'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdBleGetAddress (): Promise<string> {
    const cmd = Cmd.GET_DEVICE_ADDRESS // cmd = 1012
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    const data = (await readResp()).data
    return (_.toUpper(data.toString('hex')).match(/.{2}/g) ?? []).join(':')
  }

  /**
   * Save the settings of device to persistent storage.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdSaveSettings()
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSaveSettings (): Promise<void> {
    const cmd = Cmd.SAVE_SETTINGS // cmd = 1013
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    await readResp()
  }

  /**
   * Reset the settings of device to default values.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdResetSettings()
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdResetSettings (): Promise<void> {
    const cmd = Cmd.RESET_SETTINGS // cmd = 1014
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    await readResp()
  }

  /**
   * Set the animation mode of device while wake-up and sleep.
   * @param mode - The animation mode to be set.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { AnimationMode } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdSetAnimationMode(AnimationMode.SHORT)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSetAnimationMode (mode: AnimationMode): Promise<void> {
    if (!isAnimationMode(mode)) throw new TypeError('Invalid mode')
    const cmd = Cmd.SET_ANIMATION_MODE // cmd = 1015
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!B', mode) })
    await readResp()
  }

  /**
   * Get the animation mode of device while wake-up and sleep.
   * @returns The animation mode of device.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { AnimationMode } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const mode = await ultra.cmdGetAnimationMode()
   *   console.log(AnimationMode[mode]) // 'FULL'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetAnimationMode (): Promise<AnimationMode> {
    const cmd = Cmd.GET_ANIMATION_MODE // cmd = 1016
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0]
  }

  /**
   * Get the git version of firmware.
   * @returns The git version of firmware.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdGetGitVersion()) // '98605be'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetGitVersion (): Promise<string> {
    const cmd = Cmd.GET_GIT_VERSION // cmd = 1017
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data.toString('utf8')
  }

  /**
   * Get the active emulation tag slot of device.
   * @returns The active slot of device.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const slot = await ultra.cmdSlotGetActive()
   *   console.log(Slot[slot]) // 'SLOT_1'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotGetActive (): Promise<Slot> {
    const cmd = Cmd.GET_ACTIVE_SLOT // cmd = 1018
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0]
  }

  /**
   * Get the slot info of all slots.
   * @returns The slot info of all slots.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const slots = await ultra.cmdSlotGetInfo()
   *   console.log(JSON.stringify(slots))
   *   /**
   *    * [
   *    *   { "hfTagType": 1001, "lfTagType": 100 },
   *    *   { "hfTagType": 1001, "lfTagType": 0 },
   *    *   { "hfTagType": 0, "lfTagType": 100 },
   *    *   { "hfTagType": 0, "lfTagType": 0 },
   *    *   { "hfTagType": 0, "lfTagType": 0 },
   *    *   { "hfTagType": 0, "lfTagType": 0 },
   *    *   { "hfTagType": 0, "lfTagType": 0 },
   *    *   { "hfTagType": 0, "lfTagType": 0 }
   *    * ]
   *    *\/
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotGetInfo (): Promise<Array<{
    hfTagType: TagType
    lfTagType: TagType
  }>> {
    const cmd = Cmd.GET_SLOT_INFO // cmd = 1019
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return Decoder.SlotInfo.fromCmd1019((await readResp()).data)
  }

  /**
   * Permanently wipes Chameleon to factory settings. This will delete all your slot data and custom settings. There's no going back.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdWipeFds()
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdWipeFds (): Promise<void> {
    const cmd = Cmd.WIPE_FDS // cmd = 1020
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    await readResp()
  }

  /**
   * Delete the nick name of the slot
   * @param slot - Slot number
   * @param freq - Frequency type
   * @returns `true` if success, `false` if slot name is empty.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, FreqType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   console.log(await ultra.cmdSlotDeleteFreqName(Slot.SLOT_1, FreqType.HF)) // true
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotDeleteFreqName (slot: Slot, freq: FreqType): Promise<boolean> {
    try {
      if (!isSlot(slot)) throw new TypeError('Invalid slot')
      if (!isValidFreqType(freq)) throw new TypeError('Invalid freq')
      const cmd = Cmd.DELETE_SLOT_TAG_NICK // cmd = 1021
      const readResp = await this.#createReadRespFn({ cmd })
      await this.#sendCmd({ cmd, data: Buffer.pack('!BB', slot, freq) })
      await readResp()
      return true
    } catch (err) {
      if (err.status === RespStatus.FLASH_WRITE_FAIL) return false // slot name is empty
      throw err
    }
  }

  /**
   * Get enabled slots.
   * @returns Enabled slots.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const enabledSlots = await ultra.cmdSlotGetIsEnable()
   *   console.log(JSON.stringify(enabledSlots))
   *   // [
   *   //   { "hf": true, "lf": true },
   *   //   { "hf": true, "lf": false },
   *   //   { "hf": false, "lf": true },
   *   //   { "hf": false, "lf": false },
   *   //   { "hf": false, "lf": false },
   *   //   { "hf": false, "lf": false },
   *   //   { "hf": false, "lf": false },
   *   //   { "hf": true, "lf": false }
   *   // ]
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotGetIsEnable (): Promise<Array<{
    hf: boolean
    lf: boolean
  }>> {
    const cmd = Cmd.GET_ENABLED_SLOTS // cmd = 1023
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return Decoder.SlotFreqIsEnable.fromCmd1023((await readResp()).data)
  }

  /**
   * Delete the emulation tag data of specified freq type in specified slot.
   * @param slot - The slot to be deleted.
   * @param freq - The freq type of slot.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, FreqType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdSlotDeleteFreqType(Slot.SLOT_1, FreqType.HF)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotDeleteFreqType (slot: Slot, freq: FreqType): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isValidFreqType(freq)) throw new TypeError('Invalid freq')
    const cmd = Cmd.DELETE_SLOT_SENSE_TYPE // cmd = 1024
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB', slot, freq) })
    await readResp()
  }

  /**
   * Get the battery info of device.
   * @returns The battery info of device.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const battery = await ultra.cmdGetBatteryInfo()
   *   console.log(JSON.stringify(battery)) // { "voltage": 4192, "level": 99 }
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetBatteryInfo (): Promise<{
    voltage: number
    level: number
  }> {
    const cmd = Cmd.GET_BATTERY_INFO // cmd = 1025
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return Decoder.BatteryInfo.fromCmd1025((await readResp()).data)
  }

  /**
   * Get the button press action of specified button.
   * @param btn - The button to be get.
   * @returns The button press action of specified button.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { ButtonAction, ButtonType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const btnAction = await ultra.cmdGetButtonPressAction(ButtonType.BUTTON_A)
   *   console.log(ButtonAction[btnAction]) // 'CYCLE_SLOT_INC'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetButtonPressAction (btn: ButtonType): Promise<ButtonAction> {
    if (!isButtonType(btn)) throw new TypeError('Invalid btn')
    const cmd = Cmd.GET_BUTTON_PRESS_CONFIG // cmd = 1026
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!B', btn) })
    return (await readResp()).data[0]
  }

  /**
   * Set the button press action of specified button.
   * @param btn - The button to be set.
   * @param action - The button press action to be set.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { ButtonAction, ButtonType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdSetButtonPressAction(ButtonType.BUTTON_A, ButtonAction.CYCLE_SLOT_INC)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSetButtonPressAction (btn: ButtonType, action: ButtonAction): Promise<void> {
    if (!isButtonType(btn)) throw new TypeError('Invalid btn')
    if (!isButtonAction(action)) throw new TypeError('Invalid action')
    const cmd = Cmd.SET_BUTTON_PRESS_CONFIG // cmd = 1027
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB', btn, action) })
    await readResp()
  }

  /**
   * Get the button long press action of specified button.
   * @param btn - The button to be get.
   * @returns The button long press action of specified button.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { ButtonAction, ButtonType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const btnAction = await ultra.cmdGetButtonLongPressAction(ButtonType.BUTTON_A)
   *   console.log(ButtonAction[btnAction]) // 'CLONE_IC_UID'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetButtonLongPressAction (btn: ButtonType): Promise<ButtonAction> {
    if (!isButtonType(btn)) throw new TypeError('Invalid btn')
    const cmd = Cmd.GET_LONG_BUTTON_PRESS_CONFIG // cmd = 1028
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!B', btn) })
    return (await readResp()).data[0]
  }

  /**
   * Set the button long press action of specified button.
   * @param btn - The button to be set.
   * @param action - The button long press action to be set.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { ButtonAction, ButtonType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdSetButtonLongPressAction(ButtonType.BUTTON_A, ButtonAction.CYCLE_SLOT_INC)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSetButtonLongPressAction (btn: ButtonType, action: ButtonAction): Promise<void> {
    if (!isButtonType(btn)) throw new TypeError('Invalid btn')
    if (!isButtonAction(action)) throw new TypeError('Invalid action')
    const cmd = Cmd.SET_LONG_BUTTON_PRESS_CONFIG // cmd = 1029
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB', btn, action) })
    await readResp()
  }

  /**
   * Set the ble pairing key of device.
   * @param key - The new ble pairing key.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdBleSetPairingKey('123456')
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdBleSetPairingKey (key: string): Promise<void> {
    if (!_.isString(key) || !/^\d{6}$/.test(key)) throw new TypeError('Invalid key, must be 6 digits')
    const cmd = Cmd.SET_BLE_PAIRING_KEY // cmd = 1030
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.from(key) })
    await readResp()
  }

  /**
   * Get current ble pairing key of device.
   * @returns The ble pairing key.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdBleGetPairingKey()) // '123456'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdBleGetPairingKey (): Promise<string> {
    const cmd = Cmd.GET_BLE_PAIRING_KEY // cmd = 1031
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data.toString('utf8')
  }

  /**
   * Delete all ble bindings.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdBleDeleteAllBonds()
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdBleDeleteAllBonds (): Promise<void> {
    const cmd = Cmd.DELETE_ALL_BLE_BONDS // cmd = 1032
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    await readResp()
  }

  /**
   * Get the device is ChameleonUltra or ChameleonLite.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { DeviceModel } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const model = await ultra.cmdGetDeviceModel()
   *   console.log(DeviceModel[model]) // 'ULTRA'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetDeviceModel (): Promise<DeviceModel> {
    const cmd = Cmd.GET_DEVICE_MODEL // cmd = 1033
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0]
  }

  /**
   * Get the settings of device.
   * @returns The settings of device.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const settings = await ultra.cmdGetDeviceSettings()
   *   console.log(JSON.stringify(settings)
   *   /**
   *    * {
   *    *   "version": 5,
   *    *   "animation": 0,
   *    *   "buttonPressAction": [1, 2],
   *    *   "buttonLongPressAction": [3, 3],
   *    *   "blePairingMode": false,
   *    *   "blePairingKey": "123456"
   *    * }
   *    *\/
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetDeviceSettings (): Promise<{
    version: number
    animation: AnimationMode
    buttonPressAction: ButtonAction[]
    buttonLongPressAction: ButtonAction[]
    blePairingMode: boolean
    blePairingKey: string
  }> {
    const cmd = Cmd.GET_DEVICE_SETTINGS // cmd = 1034
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return Decoder.DeviceSettings.fromCmd1034((await readResp()).data)
  }

  /**
   * Get the cmds supported by device.
   * @returns The cmds supported by device.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const cmds = await ultra.cmdGetSupportedCmds()
   *   console.log(cmds.size) // 67
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetSupportedCmds (): Promise<Set<Cmd>> {
    const cmd = Cmd.GET_DEVICE_CAPABILITIES // cmd = 1035
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    const data = (await readResp()).data
    const cmds = new Set<Cmd>()
    for (let i = 0; i < data.length; i += 2) cmds.add(data.readUInt16BE(i))
    return cmds
  }

  /**
   * To check if the specified cmd is supported by device.
   * @returns `true` if the specified cmd is supported by device, otherwise return `false`.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Cmd } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   console.log(await ultra.isCmdSupported(Cmd.GET_APP_VERSION)) // true
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async isCmdSupported (cmd: Cmd): Promise<boolean> {
    if (this.#supportedCmds.size === 0) this.#supportedCmds = await this.cmdGetSupportedCmds()
    return this.#supportedCmds.has(cmd)
  }

  /**
   * Get the ble pairing mode of device.
   * @returns `true` if pairing is required to connect to device, otherwise return `false`.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdBleGetPairingMode()) // false
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdBleGetPairingMode (): Promise<boolean> {
    const cmd = Cmd.GET_BLE_PAIRING_ENABLE // cmd = 1036
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0] === 1
  }

  /**
   * Set if the ble pairing is required when connecting to device.
   * @param enable - `true` to enable pairing mode, `false` to disable pairing mode.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdBleSetPairingMode(false)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdBleSetPairingMode (enable: boolean | number): Promise<void> {
    if (_.isNil(enable)) throw new TypeError('enable is required')
    const cmd = Cmd.SET_BLE_PAIRING_ENABLE // cmd = 1037
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!?', enable) })
    await readResp()
  }

  /**
   * Scan 14a tag, and return basic information. The device mode must be set to READER before using this command.
   * @returns The basic infomation of scanned tag.
   * @throws This command will throw an error if tag not scanned or any error occured.
   * @group Reader Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const antiColl = _.first(await ultra.cmdHf14aScan())
   *   console.log(_.mapValues(antiColl, val => val.toString('hex')))
   *   // { uid: '040dc4420d2981', atqa: '4400', sak: '00', ats: ''}
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdHf14aScan (): Promise<Array<{
    uid: Buffer
    atqa: Buffer
    sak: Buffer
    ats: Buffer
  }>> {
    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.HF14A_SCAN // cmd = 2000
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return Decoder.Hf14aAntiColl.fromCmd2000((await readResp()).data)
  }

  /**
   * Test whether it is mifare classic tag.
   * @returns `true` if tag is mifare classic tag, otherwise return `false`.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdMf1IsSupport()) // true
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1IsSupport (): Promise<boolean> {
    try {
      await this.assureDeviceMode(DeviceMode.READER)
      const cmd = Cmd.MF1_DETECT_SUPPORT // cmd = 2001
      const readResp = await this.#createReadRespFn({ cmd })
      await this.#sendCmd({ cmd })
      await readResp()
      return true
    } catch (err) {
      if (err.status === RespStatus.HF_ERR_STAT) return false
      throw err
    }
  }

  /**
   * Check the nt level of mifare protocol.
   * @returns The nt level of mifare protocol.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Mf1PrngType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   console.log(Mf1PrngType[await ultra.cmdMf1TestPrngType()]) // 'WEAK'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1TestPrngType (): Promise<Mf1PrngType> {
    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.MF1_DETECT_NT_LEVEL // cmd = 2002
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0]
  }

  /**
   * Use a known key to do the mifare static nested attack.
   * @param known - The info of known key.
   * @param known.block - The block of known key.
   * @param known.key - The known key.
   * @param known.keyType - The key type of known key.
   * @param target - The info of target key to be attack.
   * @param target.block - The block of target key.
   * @param target.keyType - The key type of target key.
   * @returns The result of mifare static nested attack.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const res1 = await ultra.cmdMf1AcquireStaticNested({
   *     block: 0,
   *     keyType: Mf1KeyType.KEY_A,
   *     key
   *   }, {
   *     block: 4,
   *     keyType: Mf1KeyType.KEY_A
   *   })
   *   const res = {
   *     uid: res1.uid.toString('hex'),
   *     atks: _.map(res1.atks, item => ({ nt1: item.nt1.toString('hex'), nt2: item.nt2.toString('hex') })),
   *   }
   *   console.log(res)
   *   // {
   *   //   uid: 'b908a16d',
   *   //   atks: [
   *   //     { nt1: '01200145', nt2: '81901975' },
   *   //     { nt1: '01200145', nt2: 'cdd400f3' },
   *   //   ],
   *   // }
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1AcquireStaticNested (
    known: { block: number, key: Buffer, keyType: Mf1KeyType },
    target: { block: number, keyType: Mf1KeyType }
  ): Promise<{ uid: Buffer, atks: Array<{ nt1: Buffer, nt2: Buffer }> }> {
    validateMf1BlockKey(known.block, known.keyType, known.key, 'known.')
    if (!isMf1BlockNo(target.block)) throw new TypeError('Invalid target.block')
    if (!isMf1KeyType(target.keyType)) throw new TypeError('Invalid target.keyType')
    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.MF1_STATIC_NESTED_ACQUIRE // cmd = 2003
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB6sBB', known.keyType, known.block, known.key, target.keyType, target.block) })
    return Decoder.Mf1AcquireStaticNestedRes.fromCmd2003((await readResp()).data)
  }

  /**
   * Acquire the data from mifare darkside attack.
   * @param block - The target block.
   * @param keyType - The target key type.
   * @param isFirst - `true` if this is the first attack.
   * @param syncMax - The max sync count of darkside attack.
   * @returns The data from mifare darkside attack.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Mf1KeyType, DarksideStatus } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const res1 = await ultra.cmdMf1AcquireDarkside(0, Mf1KeyType.KEY_A, true)
   *   console.log(res1)
   *   const res2 = {
   *     status: `${DarksideStatus[res1.status]} (${res1.status})`,
   *     ...(res1.status !== DarksideStatus.OK ? {} : {
   *       ar: res1.ar.toString('hex'),
   *       ks: res1.ks.toString('hex'),
   *       nr: res1.nr.toString('hex'),
   *       nt: res1.nt.toString('hex'),
   *       par: res1.par.toString('hex'),
   *       uid: res1.uid.toString('hex'),
   *     }),
   *   }
   *   console.log(res2)
   *   // {
   *   //   "ar": "00000000",
   *   //   "ks": "0c0508080f04050a",
   *   //   "nr": "00000000",
   *   //   "nt": "b346fc3d",
   *   //   "par": "0000000000000000",
   *   //   "status": "OK (0)",
   *   //   "uid": "d3efed0c"
   *   // }
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   *
   * If you want to use darkside attack to recover the key, you can use the following example code:
   *
   * ```js
   * async function run (ultra) {
   *   const { Buffer, DarksideStatus, Mf1KeyType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const block = 0
   *   const keyType = Mf1KeyType.KEY_A
   *   const key = await Crypto1.darkside(
   *     async attempt => {
   *       const accquired = await ultra.cmdMf1AcquireDarkside(block, keyType, attempt === 0)
   *       console.log(_.mapValues(accquired, buf => Buffer.isBuffer(buf) ? buf.toString('hex') : buf))
   *       if (acquired.status === DarksideStatus.LUCKY_AUTH_OK) throw new Error('LUCKY_AUTH_OK')
   *       if (acquired.status !== DarksideStatus.OK) throw new Error('card is not vulnerable to Darkside attack')
   *       return accquired
   *     },
   *     async key => {
   *       return await ultra.cmdMf1CheckBlockKey({ block, keyType, key })
   *     },
   *   )
   *   console.log(`key founded: ${key.toString('hex')}`)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1AcquireDarkside (
    block: number,
    keyType: Mf1KeyType,
    isFirst: boolean | number,
    syncMax: number = 30
  ): Promise<{
      status: DarksideStatus
      uid?: Buffer
      nt?: Buffer
      par?: Buffer
      ks?: Buffer
      nr?: Buffer
      ar?: Buffer
    }> {
    if (!_.isSafeInteger(block)) throw new TypeError('Invalid block')
    if (!isMf1KeyType(keyType)) throw new TypeError('Invalid keyType')
    if (_.isNil(isFirst)) throw new TypeError('Invalid isFirst')
    if (!_.isSafeInteger(syncMax)) throw new TypeError('Invalid syncMax')
    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.MF1_DARKSIDE_ACQUIRE // cmd = 2004
    const readResp = await this.#createReadRespFn({ cmd, timeout: syncMax * 1e4 })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB?B', keyType, block, isFirst, syncMax) })
    return Decoder.Mf1DarksideRes.fromCmd2004((await readResp()).data)
  }

  /**
   * Dectect the nt distance of mifare protocol.
   * @param known - The info of known key.
   * @param known.block - The block of known key.
   * @param known.key - The known key.
   * @param known.keyType - The key type of known key.
   * @returns The nt distance of mifare protocol.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const res1 = await ultra.cmdMf1TestNtDistance({ block: 0, keyType: Mf1KeyType.KEY_A, key })
   *   const res2 = await ultra.cmdMf1AcquireNested(
   *     { block: 0, keyType: Mf1KeyType.KEY_A, key },
   *     { block: 4, keyType: Mf1KeyType.KEY_A },
   *   )
   *   const res = {
   *     uid: res1.uid.toString('hex'),
   *     dist: res1.dist.toString('hex'),
   *     atks: _.map(res2, item => ({
   *       nt1: item.nt1.toString('hex'),
   *       nt2: item.nt2.toString('hex'),
   *       par: item.par,
   *     }))
   *   }
   *   console.log(res)
   *   // {
   *   //   uid: '877209e1',
   *   //   dist: '00000080',
   *   //   atks: [
   *   //     { nt1: '35141fcb', nt2: '40430522', par: 7 },
   *   //     { nt1: 'cff2b3ef', nt2: '825ba8ea', par: 5 },
   *   //   ]
   *   // }
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1TestNtDistance (known: {
    block: number
    key: Buffer
    keyType: Mf1KeyType
  }): Promise<{ uid: Buffer, dist: Buffer }> {
    validateMf1BlockKey(known.block, known.keyType, known.key, 'known.')
    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.MF1_DETECT_NT_DIST // cmd = 2005
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB6s', known.keyType, known.block, known.key) })
    return Decoder.Mf1NtDistanceRes.fromCmd2005((await readResp()).data)
  }

  /**
   * Use a known key to do the mifare nested attack.
   * @param known - The info of known key.
   * @param known.block - The block of known key.
   * @param known.key - The known key.
   * @param known.keyType - The key type of known key.
   * @param target - The info of target key to be attack.
   * @param target.block - The block of target key.
   * @param target.keyType - The key type of target key.
   * @returns The result of mifare nested attack.
   * - nt1: Unblocked explicitly random number
   * - nt2: Random number of nested verification encryption
   * - par: The puppet test of the communication process of nested verification encryption, only the 'low 3 digits', that is, the right 3
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const res1 = await ultra.cmdMf1TestNtDistance({ block: 0, keyType: Mf1KeyType.KEY_A, key })
   *   const res2 = await ultra.cmdMf1AcquireNested(
   *     { block: 0, keyType: Mf1KeyType.KEY_A, key },
   *     { block: 4, keyType: Mf1KeyType.KEY_A },
   *   )
   *   const res = {
   *     uid: res1.uid.toString('hex'),
   *     dist: res1.dist.toString('hex'),
   *     atks: _.map(res2, item => ({
   *       nt1: item.nt1.toString('hex'),
   *       nt2: item.nt2.toString('hex'),
   *       par: item.par,
   *     }))
   *   }
   *   console.log(res)
   *   // {
   *   //   uid: '877209e1',
   *   //   dist: '00000080',
   *   //   atks: [
   *   //     { nt1: '35141fcb', nt2: '40430522', par: 7 },
   *   //     { nt1: 'cff2b3ef', nt2: '825ba8ea', par: 5 },
   *   //   ]
   *   // }
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1AcquireNested (
    known: { block: number, key: Buffer, keyType: Mf1KeyType },
    target: { block: number, keyType: Mf1KeyType }
  ): Promise<Array<{ nt1: Buffer, nt2: Buffer, par: number }>> {
    validateMf1BlockKey(known.block, known.keyType, known.key, 'known.')
    if (!_.isSafeInteger(target.block)) throw new TypeError('Invalid target.block')
    if (!isMf1KeyType(target.keyType)) throw new TypeError('Invalid target.keyType')
    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.MF1_NESTED_ACQUIRE // cmd = 2006
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB6sBB', known.keyType, known.block, known.key, target.keyType, target.block) })
    return Decoder.Mf1NestedRes.fromCmd2006((await readResp()).data)
  }

  /**
   * Check if the key is valid for specified block and key type.
   * @param opts - The info of key to be checked.
   * @param opts.block - The block of key to be checked.
   * @param opts.keyType - The type of key to be checked.
   * @param opts.key - The key to be checked.
   * @returns `true` if the key is valid for specified block and key type.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   console.log(await ultra.cmdMf1CheckBlockKey({
   *     block: 0,
   *     keyType: Mf1KeyType.KEY_A,
   *     key,
   *   })) // true
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1CheckBlockKey (opts: { block: number, key: Buffer, keyType: Mf1KeyType }): Promise<boolean> {
    const { block, keyType, key } = opts
    try {
      validateMf1BlockKey(block, keyType, key)
      await this.assureDeviceMode(DeviceMode.READER)
      const cmd = Cmd.MF1_AUTH_ONE_KEY_BLOCK // cmd = 2007
      const readResp = await this.#createReadRespFn({ cmd })
      await this.#sendCmd({ cmd, data: Buffer.pack('!BB6s', keyType, block, key) })
      await readResp()
      return true
    } catch (err) {
      if (err.status === RespStatus.MF_ERR_AUTH) return false
      throw err
    }
  }

  /**
   * Read block data from a mifare tag.
   * @param opts - The block to be read and the key info of the block.
   * @param opts.block - The block to be read.
   * @param opts.keyType - The key type of the block.
   * @param opts.key - The key of the block.
   * @returns The block data read from a mifare tag.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const block1 = await ultra.cmdMf1ReadBlock({
   *     block: 1,
   *     keyType: Mf1KeyType.KEY_A,
   *     key,
   *   })
   *   console.log(block1.toString('hex')) // '00000000000000000000000000000000'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1ReadBlock (opts: { block: number, key: Buffer, keyType: Mf1KeyType }): Promise<Buffer> {
    const { block, keyType, key } = opts
    validateMf1BlockKey(block, keyType, key)
    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.MF1_READ_ONE_BLOCK // cmd = 2008
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB6s', keyType, block, key) })
    return (await readResp()).data
  }

  /**
   * Write data to a mifare tag.
   * @param opts - The block to be written and the key info of the block.
   * @param opts.block - The block to be written.
   * @param opts.keyType - The key type of the block.
   * @param opts.key - The key of the block.
   * @param opts.data - The block data to be written.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const block1 = Buffer.from('00000000000000000000000000000000', 'hex')
   *   await ultra.cmdMf1WriteBlock({
   *     block: 1,
   *     keyType: Mf1KeyType.KEY_A,
   *     key,
   *     data: block1,
   *   })
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1WriteBlock (opts: {
    block: number
    keyType: Mf1KeyType
    key: Buffer
    data: Buffer
  }): Promise<void> {
    const { block, keyType, key, data } = opts
    validateMf1BlockKey(block, keyType, key)
    bufIsLenOrFail(data, 16, 'data')
    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.MF1_WRITE_ONE_BLOCK // cmd = 2009
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB6s16s', keyType, block, key, data) })
    await readResp()
  }

  /**
   * Get the info composed of `cmdHf14aScan()` and `cmdMf1TestNtLevel()`.
   * @returns The info about 14a tag and mifare protocol.
   * @group Reader Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Mf1PrngType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const tag = _.first(await ultra.hf14aInfo())
   *   console.log(tag.nxpTypeBySak) // 'MIFARE Classic 1K | Plus SE 1K | Plug S 2K | Plus X 2K'
   *   console.log(Mf1PrngType[tag.prngType]) // 'WEAK'
   *   console.log(_.mapValues(tag.antiColl, val => val.toString('hex')))
   *   // { uid: 'dbe3d63d', atqa: '0400', sak: '08', ats: '' }
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async hf14aInfo (): Promise<Array<{
    antiColl: { uid: Buffer, atqa: Buffer, sak: Buffer, ats: Buffer }
    nxpTypeBySak?: string
    prngType?: Mf1PrngType
  }>> {
    const items = []
    const antiColls = await this.cmdHf14aScan()
    for (const antiColl of antiColls) {
      const item: Decoder.Hf14aTagInfo = { antiColl, nxpTypeBySak: NxpTypeBySak.get(antiColl.sak[0]) }
      items.push(item)
    }
    if (antiColls.length === 1 && await this.cmdMf1IsSupport()) {
      items[0].prngType = await this.cmdMf1TestPrngType()
    }
    return items
  }

  /**
   * Send raw NfcA data to a tag and receive the response.
   * @param opts.activateRfField - Set `true` to activate RF field. If `data` is not empty or `autoSelect` is true, `activateRfField` will be set to `true`.
   * @param opts.appendCrc - Set `true` to add CRC before sending data.
   * @param opts.autoSelect - Set `true` to automatically select card before sending data.
   * @param opts.checkResponseCrc - Set `true` to verify CRC of response and remove. If CRC of response is valid, CRC will be removed from response, otherwise will throw HF_ERR_CRC error.
   * @param opts.data - The data to be send. If `appendCrc` is `true`, the maximum length of data is `62`, otherwise is `64`.
   * @param opts.dataBitLength - Number of bits to send. Useful for send partial byte. `dataBitLength` is incompatible with `appendCrc`.
   * @param opts.keepRfField - Set `true` to keep the RF field active after sending.
   * @param opts.waitResponse - Default value is `true`. Set `false` to skip reading tag response.
   * @param opts.timeout - Default value is `1000 ms`. Maximum timeout for reading tag response in ms while `waitResponse` is `true`.
   * @returns The response from tag.
   * @group Reader Related
   */
  async cmdHf14aRaw (opts: {
    activateRfField?: boolean
    appendCrc?: boolean
    autoSelect?: boolean
    checkResponseCrc?: boolean
    data?: Buffer
    dataBitLength?: number
    keepRfField?: boolean
    waitResponse?: boolean
    timeout?: number
  }): Promise<Buffer> {
    let {
      activateRfField = false,
      waitResponse = true,
      appendCrc = false,
      autoSelect = false,
      keepRfField = false,
      checkResponseCrc = false,
      dataBitLength = 0,
      timeout = 1000,
      data = new Buffer(),
    } = opts

    if (!Buffer.isBuffer(data)) throw new TypeError('data must be a Buffer')
    if (!_.isSafeInteger(timeout)) throw new TypeError('Invalid timeout')
    if (!_.isSafeInteger(dataBitLength)) throw new TypeError('Invalid dataBitLength')

    // [8, 1, 2, 3, 4, 5, 6, 7]
    dataBitLength = (data.length - 1) * 8 + (dataBitLength + 7) % 8 + 1
    const buf1 = Buffer.pack(`!xHH${data.length}s`, timeout, dataBitLength, data)

    // options
    for (const [bitOffset, val] of [
      [0, activateRfField],
      [1, waitResponse],
      [2, appendCrc],
      [3, autoSelect],
      [4, keepRfField],
      [5, checkResponseCrc],
    ] as Array<[number, boolean]>) buf1.writeBitMSB(val, bitOffset)

    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.HF14A_RAW // cmd = 2010
    const readResp = await this.#createReadRespFn({ cmd, timeout: READ_DEFAULT_TIMEOUT + timeout })
    await this.#sendCmd({ cmd, data: buf1 })
    return (await readResp()).data
  }

  /**
   * MIFARE Classic manipulate value block
   *
   * - Decrement: decrement value by `X` (`0` ~ `2147483647`) from src to dst
   * - Increment: increment value by `X` (`0` ~ `2147483647`) from src to dst
   * - Restore: copy value from src to dst (Restore and Transfer)
   *
   * @param src - The key info of src block.
   * @param src.key - The key of src block.
   * @param src.keyType - The key type of src block.
   * @param src.block - The block of src block.
   * @param operator - The operator of value block.
   * @param operand - The operand of value block.
   * @param dst - The key info of dst block.
   * @param dst.key - The key of dst block.
   * @param dst.keyType - The key type of dst block.
   * @param dst.block - The block of dst block.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType, Mf1VblockOperator } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const src = { block: 4, keyType: Mf1KeyType.KEY_A, key }
   *   await ultra.mf1VblockSetValue(src, { value: 2 })
   *   console.log(await ultra.mf1VblockGetValue(src))
   *   await ultra.cmdMf1VblockManipulate(
   *     { block: 4, keyType: Mf1KeyType.KEY_A, key },
   *     Mf1VblockOperator.DECREMENT, 1,
   *     { block: 4, keyType: Mf1KeyType.KEY_A, key },
   *   )
   *   console.log(await ultra.mf1VblockGetValue(src))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1VblockManipulate (
    src: { block: number, key: Buffer, keyType: Mf1KeyType },
    operator: Mf1VblockOperator,
    operand: number,
    dst: { block: number, key: Buffer, keyType: Mf1KeyType },
  ): Promise<void> {
    validateMf1BlockKey(src.block, src.keyType, src.key, 'src.')
    validateMf1BlockKey(dst.block, dst.keyType, dst.key, 'dst.')
    if (!isMf1VblockOperator(operator)) throw new TypeError('Invalid operator')
    if (!_.isSafeInteger(operand)) throw new TypeError('Invalid operand')
    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.MF1_MANIPULATE_VALUE_BLOCK // cmd = 2011
    const data = Buffer.pack('!BB6sBiBB6s', src.keyType, src.block, src.key, operator, operand, dst.keyType, dst.block, dst.key)
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data })
    await readResp()
  }

  /**
   * Get value from `opts` block (MIFARE Classic value block)
   * @param opts - The key info of `opts` block.
   * @param opts.block - The block of `opts` block.
   * @param opts.keyType - The key type of `opts` block.
   * @param opts.key - The key of `opts` block.
   * @returns The value and address of `opts` block.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType, Mf1VblockOperator } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const src = { block: 4, keyType: Mf1KeyType.KEY_A, key }
   *   await ultra.mf1VblockSetValue(src, { value: 2 })
   *   console.log(await ultra.mf1VblockGetValue(src))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mf1VblockGetValue (opts: { block: number, key: Buffer, keyType: Mf1KeyType }): Promise<{ value: number, adr: number }> {
    const blkDt = await this.cmdMf1ReadBlock(opts)
    const [val1, val2, val3] = _.times(3, i => blkDt.readInt32LE(i * 4))
    if (val1 !== val3 || val1 + val2 !== -1) throw new Error(`Invalid value of value block: ${blkDt.toString('hex')}`)
    const [adr1, adr2, adr3, adr4] = blkDt.subarray(12, 16) as unknown as number[]
    if (adr1 !== adr3 || adr2 !== adr4 || adr1 + adr2 !== 0xFF) throw new Error(`Invalid address of value block: ${blkDt.toString('hex')}`)
    return { adr: adr1, value: val1 }
  }

  /**
   * Set value X (-2147483647 ~ 2147483647) to `dst` block (MIFARE Classic value block)
   * @param dst - The key info of `dst` block.
   * @param dst.block - The block of `dst` block.
   * @param dst.keyType - The key type of `dst` block.
   * @param dst.key - The key of `dst` block.
   * @param val - The value and address to be set.
   * @param val.value - The value to be set. Default is `0`.
   * @param val.adr - The address to be set. Default is `dst.block`.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType, Mf1VblockOperator } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const src = { block: 4, keyType: Mf1KeyType.KEY_A, key }
   *   await ultra.mf1VblockSetValue(src, { value: 2 })
   *   console.log(await ultra.mf1VblockGetValue(src))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mf1VblockSetValue (
    dst: { block: number, key: Buffer, keyType: Mf1KeyType },
    val: { adr?: number, value?: number }
  ): Promise<void> {
    const blkDt = new Buffer(16)
    const { value: val1 = 0, adr: adr1 = dst.block } = val
    if (!_.isSafeInteger(val1)) throw new TypeError('Invalid val.value')
    const [val2, adr2] = [-val1 - 1, 0xFF - adr1]
    blkDt.writeInt32LE(val1, 0).writeInt32LE(val2, 4).writeInt32LE(val1, 8)
    blkDt[12] = blkDt[14] = adr1
    blkDt[13] = blkDt[15] = adr2
    await this.cmdMf1WriteBlock({ ...dst, data: blkDt })
  }

  /**
   * Given a list of keys, check which is the correct key A and key B of the sectors. If you want to check more than 83 keys, you can use `mf1CheckKeysOfSectors()`.
   * @param opts.keys - The keys to be checked. Maximum length is `83`.
   * @param opts.mask - The mask of sectors. 80 bits, 2 bits/sector, the first bit is key A, the second bit is key B, `0b1` represent to skip checking the key.
   * @returns
   * - `found`: 80 bits, 2 bits/sector, the first bit is key A, the second bit is key B, `0b1` represent key is found.
   * - `sectorKeys`: 80 keys, 2 keys/sector, the first key is key A, the second key is key B. `null` represent key is not found.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const mask = Buffer.from('00000000FFFFFFFFFFFF', 'hex')
   *   const keys = Buffer.from('FFFFFFFFFFFF\n000000000000\nA0A1A2A3A4A5\nD3F7D3F7D3F7', 'hex').chunk(6)
   *   const tsStart = Date.now()
   *   const result = await ultra.cmdMf1CheckKeysOfSectors({ keys, mask })
   *   console.log(`Time: ${Date.now() - tsStart}ms`)
   *   const replacer = function (k, v) { return Buffer.isBuffer(this[k]) ? this[k].toString('hex') : v }
   *   console.log(JSON.stringify(result, replacer, 2))
   * }
   * // {
   * //   "found": "ffffffff000000000000",
   * //   "sectorKeys": [
   * //     "ffffffffffff", "ffffffffffff", "ffffffffffff", "ffffffffffff",
   * //     "ffffffffffff", "ffffffffffff", "ffffffffffff", "ffffffffffff",
   * //     "ffffffffffff", "ffffffffffff", "ffffffffffff", "ffffffffffff",
   * //     "ffffffffffff", "ffffffffffff", "ffffffffffff", "ffffffffffff",
   * //     "ffffffffffff", "ffffffffffff", "ffffffffffff", "ffffffffffff",
   * //     "ffffffffffff", "ffffffffffff", "ffffffffffff", "ffffffffffff",
   * //     "ffffffffffff", "ffffffffffff", "ffffffffffff", "ffffffffffff",
   * //     "ffffffffffff", "ffffffffffff", "ffffffffffff", "ffffffffffff",
   * //     null, null, null, null,
   * //     null, null, null, null,
   * //     null, null, null, null,
   * //     null, null, null, null,
   * //     null, null, null, null,
   * //     null, null, null, null,
   * //     null, null, null, null,
   * //     null, null, null, null,
   * //     null, null, null, null,
   * //     null, null, null, null,
   * //     null, null, null, null,
   * //     null, null, null, null,
   * //   ]
   * // }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1CheckKeysOfSectors (opts: { keys: Buffer[], mask: Buffer }): Promise<null | {
    found: Buffer
    sectorKeys: Array<Buffer | null>
  }> {
    const { keys, mask } = opts
    bufIsLenOrFail(mask, 10, 'mask')
    if (keys.length < 1 || keys.length > 83) throw new TypeError('Invalid keys.length')
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      bufIsLenOrFail(key, 6, `keys[${i}]`)
    }

    let bitsCnt = 80
    for (let b of mask) while (b > 0) [bitsCnt, b] = [bitsCnt - (b & 0b1), b >>> 1]
    if (bitsCnt < 1) return null

    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.MF1_CHECK_KEYS_OF_SECTORS // cmd = 2012
    const data = Buffer.concat([mask, ...keys])
    const timeout = READ_DEFAULT_TIMEOUT + bitsCnt * (keys.length + 1) * 100
    const readResp = await this.#createReadRespFn({ cmd, timeout })
    await this.#sendCmd({ cmd, data })
    return Decoder.Mf1CheckKeysOfSectorsRes.fromCmd2012((await readResp()).data)
  }

  /**
   * Scan em410x tag and print id
   * @returns The id of em410x tag.
   * @group Reader Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const id = await ultra.cmdEm410xScan()
   *   console.log(id.toString('hex')) // 'deadbeef88'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdEm410xScan (): Promise<Buffer> {
    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.EM410X_SCAN // cmd = 3000
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data
  }

  /**
   * Write id of em410x tag to t55xx tag.
   * @param id - The id of em410x tag.
   * @param newKey - The new key of t55xx tag.
   * @param oldKeys - The keys to be checked. Maximum length is `125`.
   * @group Reader Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const id = Buffer.from('deadbeef88', 'hex')
   *   // https://github.com/RfidResearchGroup/proxmark3/blob/master/client/dictionaries/t55xx_default_pwds.dic
   *   const newKey = Buffer.from('20206666', 'hex')
   *   const oldKeys = Buffer.from('5124364819920427', 'hex').chunk(4)
   *   await ultra.cmdEm410xWriteToT55xx(id, newKey, oldKeys)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdEm410xWriteToT55xx (id: Buffer, newKey: Buffer, oldKeys: Buffer[]): Promise<void> {
    bufIsLenOrFail(id, 5, 'id')
    bufIsLenOrFail(newKey, 4, 'newKey')
    if (oldKeys.length < 1 || oldKeys.length > 125) throw new TypeError('Invalid oldKeys.length')
    for (let i = 0; i < oldKeys.length; i++) bufIsLenOrFail(oldKeys[i], 4, `oldKeys[${i}]`)
    await this.assureDeviceMode(DeviceMode.READER)
    const cmd = Cmd.EM410X_WRITE_TO_T55XX // cmd = 3001
    const data = Buffer.concat([id, newKey, ...oldKeys])
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data })
    await readResp()
  }

  /**
   * Set the mifare block data of actived slot.
   * @param offset - The start block of actived slot.
   * @param data - The data to be set. the length of data should be multiples of 16.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdMf1EmuWriteBlock(1, Buffer.alloc(16))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1EmuWriteBlock (offset: number, data: Buffer): Promise<void> {
    if (!_.isSafeInteger(offset)) throw new TypeError('Invalid offset')
    if (!Buffer.isBuffer(data) || data.length % 16 !== 0) throw new TypeError('data must be a Buffer with length be multiples of 16')
    const cmd = Cmd.MF1_WRITE_EMU_BLOCK_DATA // cmd = 4000
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack(`!B${data.length}s`, offset, data) })
    await readResp()
  }

  /**
   * Set the mifare anti-collision data of actived slot.
   * @param opts.uid - The new uid to be set.
   * @param opts.atqa - `2 bytes`, the new atqa to be set.
   * @param opts.sak - `1 byte`, the new sak to be set.
   * @param opts.ats - The new ats to be set.
   * @group Emulator Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdHf14aSetAntiCollData({
   *     atqa: Buffer.from('0400', 'hex'),
   *     sak: Buffer.from('08', 'hex'),
   *     uid: Buffer.from('01020304', 'hex')
   *   })
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdHf14aSetAntiCollData (opts: {
    uid: Buffer
    atqa: Buffer
    sak: Buffer
    ats?: Buffer
  }): Promise<void> {
    const { uid, atqa, sak, ats = new Buffer() } = opts
    if (!Buffer.isBuffer(uid) || !_.includes([4, 7, 10], uid.length)) throw new TypeError('uid must be a Buffer with length 4, 7 or 10')
    bufIsLenOrFail(atqa, 2, 'atqa')
    bufIsLenOrFail(sak, 1, 'sak')
    if (!Buffer.isBuffer(ats)) throw new TypeError('ats must be a Buffer')
    const cmd = Cmd.HF14A_SET_ANTI_COLL_DATA // cmd = 4001
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack(`!${uid.length + 1}p2ss${ats.length + 1}p`, uid, atqa, sak, ats) })
    await readResp()
  }

  /**
   * Enable or disable the mifare MFKey32 detection and clear the data of detections.
   * @param enable - `true` to enable the detection, `false` to disable the detection.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdMf1SetDetectionEnable(true)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1SetDetectionEnable (enable: boolean | number): Promise<void> {
    if (_.isNil(enable)) throw new TypeError('enable is required')
    const cmd = Cmd.MF1_SET_DETECTION_ENABLE // cmd = 4004
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!?', enable) })
    await readResp()
  }

  /**
   * Get the count of mifare MFKey32 detections.
   * @returns The count of mifare MFKey32 detections.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdMf1GetDetectionCount()) // 0
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1GetDetectionCount (): Promise<number> {
    const cmd = Cmd.MF1_GET_DETECTION_COUNT // cmd = 4005
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data.readUInt32BE()
  }

  /**
   * Get the data of mifare MFKey32 detections.
   * @param offset - The start log of detections to be get.
   * @returns The mifare MFKey32 detections.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const logs = await ultra.cmdMf1GetDetectionLogs(0)
   *   console.log(logs)
   *   /**
   *    * {
   *    *   "block": 2,
   *    *   "isKeyB": 1,
   *    *   "isNested": 0,
   *    *   "uid": Buffer.from('65535d33', 'hex'),
   *    *   "nt": Buffer.from('cb7b9ed9', 'hex'),
   *    *   "nr": Buffer.from('5a8ffec6', 'hex'),
   *    *   "ar": Buffer.from('5c7c6f89', 'hex'),
   *    * }
   *    *\/
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1GetDetectionLogs (offset: number = 0): Promise<Array<{
    block: number
    isKeyB: boolean
    isNested: boolean
    uid: Buffer
    nt: Buffer
    nr: Buffer
    ar: Buffer
  }>> {
    if (!_.isSafeInteger(offset)) throw new TypeError('Invalid offset')
    const cmd = Cmd.MF1_GET_DETECTION_LOG // cmd = 4006
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!I', offset) })
    return Decoder.Mf1DetectionLog.fromCmd4006((await readResp()).data)
  }

  /**
   * Get the feature of mifare MFKey32 detections is enabled or not.
   * @returns `true` if the feature of mifare MFKey32 detections is enabled, otherwise return `false`.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdMf1GetDetectionEnable()) // false
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1GetDetectionEnable (): Promise<boolean> {
    const cmd = Cmd.MF1_GET_DETECTION_ENABLE // cmd = 4007
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0] === 1
  }

  /**
   * Get the mifare block data of actived slot.
   * @param offset - The start block of actived slot.
   * @param length - The count of blocks to be get.
   * @returns The mifare block data of actived slot.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const data = await ultra.cmdMf1EmuReadBlock(1)
   *   console.log(data.toString('hex')) // '00000000000000000000000000000000'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1EmuReadBlock (offset: number = 0, length: number = 1): Promise<Buffer> {
    const cmd = Cmd.MF1_READ_EMU_BLOCK_DATA // cmd = 4008
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB', offset, length) })
    return (await readResp()).data
  }

  /**
   * Get the mifare settings of actived slot.
   * @returns The mifare settings of actived slot.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const mf1Settings = await ultra.cmdMf1GetEmuSettings()
   *   console.log(JSON.stringify(mf1Settings))
   *   /**
   *    * {
   *    *   "detection": false,
   *    *   "gen1a": false,
   *    *   "gen2": false,
   *    *   "antiColl": false,
   *    *   "write": 0
   *    *  }
   *    *\/
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1GetEmuSettings (): Promise<{
    detection: boolean
    gen1a: boolean
    gen2: boolean
    antiColl: boolean
    write: Mf1EmuWriteMode
  }> {
    const cmd = Cmd.MF1_GET_EMULATOR_CONFIG // cmd = 4009
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return Decoder.Mf1EmuSettings.fromCmd4009((await readResp()).data)
  }

  /**
   * Set the mifare gen1a mode of actived slot.
   * @returns The mifare gen1a mode of actived slot.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdMf1GetGen1aMode()) // false
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1GetGen1aMode (): Promise<boolean> {
    const cmd = Cmd.MF1_GET_GEN1A_MODE // cmd = 4010
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0] === 1
  }

  /**
   * Set the mifare gen1a mode of actived slot.
   * @param enable - `true` to enable the gen1a mode, `false` to disable the gen1a mode.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdMf1SetGen1aMode(false)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1SetGen1aMode (enable: boolean | number): Promise<void> {
    if (_.isNil(enable)) throw new TypeError('enable is required')
    const cmd = Cmd.MF1_SET_GEN1A_MODE // cmd = 4011
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!?', enable) })
    await readResp()
  }

  /**
   * Get the mifare gen2 mode of actived slot.
   * @returns The mifare gen2 mode of actived slot.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdMf1GetGen2Mode()) // false
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1GetGen2Mode (): Promise<boolean> {
    const cmd = Cmd.MF1_GET_GEN2_MODE // cmd = 4012
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0] === 1
  }

  /**
   * Set the mifare gen2 mode of actived slot.
   * @param enable - `true` to enable the gen2 mode, `false` to disable the gen2 mode.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdMf1SetGen2Mode(false)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1SetGen2Mode (enable: boolean | number): Promise<void> {
    if (_.isNil(enable)) throw new TypeError('enable is required')
    const cmd = Cmd.MF1_SET_GEN2_MODE // cmd = 4013
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!?', enable) })
    await readResp()
  }

  /**
   * Get the mode of actived slot that using anti-collision data from block 0 for 4 byte UID tags or not.
   * @returns The mode of actived slot that using anti-collision data from block 0 for 4 byte UID tags or not.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdMf1GetAntiCollMode()) // false
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1GetAntiCollMode (): Promise<boolean> {
    const cmd = Cmd.HF14A_GET_BLOCK_ANTI_COLL_MODE // cmd = 4014
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0] === 1
  }

  /**
   * Set the mode of actived slot that using anti-collision data from block 0 for 4 byte UID tags or not.
   * @param enable - `true` to enable the mode, `false` to disable the mode.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdMf1SetAntiCollMode(false)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1SetAntiCollMode (enable: boolean | number): Promise<void> {
    if (_.isNil(enable)) throw new TypeError('enable is required')
    const cmd = Cmd.HF14A_SET_BLOCK_ANTI_COLL_MODE // cmd = 4015
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!?', enable) })
    await readResp()
  }

  /**
   * Get the mifare write mode of actived slot.
   * @returns The mifare write mode of actived slot.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdMf1GetWriteMode()) // 0
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1GetWriteMode (): Promise<Mf1EmuWriteMode> {
    const cmd = Cmd.MF1_GET_WRITE_MODE // cmd = 4016
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0]
  }

  /**
   * Set the mifare write mode of actived slot.
   * @param mode - The mifare write mode of actived slot.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Mf1EmuWriteMode } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdMf1SetWriteMode(Mf1EmuWriteMode.NORMAL)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1SetWriteMode (mode: Mf1EmuWriteMode): Promise<void> {
    if (!isMf1EmuWriteMode(mode)) throw new TypeError('Invalid mode')
    const cmd = Cmd.MF1_SET_WRITE_MODE // cmd = 4017
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!B', mode) })
    await readResp()
  }

  /**
   * Get anti-collision data from actived slot.
   * @returns The anti-collision data from actived slot.
   * @group Emulator Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const res = await ultra.cmdHf14aGetAntiCollData()
   *   console.log(JSON.stringify(res))
   *   // {
   *   //   "uid": { "type": "Buffer", "data": [222, 173, 190, 239] },
   *   //   "atqa": { "type": "Buffer", "data": [4, 0] },
   *   //   "sak": { "type": "Buffer", "data": [8] },
   *   //   "ats": { "type": "Buffer", "data": [] }
   *   // }
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdHf14aGetAntiCollData (): Promise<{ uid: Buffer, atqa: Buffer, sak: Buffer, ats: Buffer } | null> {
    const cmd = Cmd.HF14A_GET_ANTI_COLL_DATA // cmd = 4018
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    const data = (await readResp()).data
    return data.length > 0 ? Decoder.Hf14aAntiColl.fromBuffer(data) : null
  }

  /**
   * Get the magic mode of actived slot.
   *
   * If the actived slot is in magic mode, all read and write protection is bypassed.
   *
   * - The UID (page 0-1) can be write.
   * - Static Lock Bytes (page 2) and Dynamic Lock Bytes can be write with any value.
   * - The Capability Container CC of NTAG (page 3) can be write with any value.
   * - PWD and PACK can be read.
   * - All other pages can be read/write without authentication.
   * - The counter of NTAG can be read without authentication.
   * @group Mifare Ultralight Related
   * @returns The magic mode of actived slot.
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdMfuGetMagicMode()) // false
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuGetMagicMode (): Promise<boolean> {
    const cmd = Cmd.MF0_NTAG_GET_UID_MAGIC_MODE // cmd = 4019
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0] === 1
  }

  /**
   * Set the magic mode of actived slot.
   *
   * If the actived slot is in magic mode, all read and write protection is bypassed.
   *
   * - The UID (page 0-1) can be write.
   * - Static Lock Bytes (page 2) and Dynamic Lock Bytes can be write with any value.
   * - The Capability Container CC of NTAG (page 3) can be write with any value.
   * - PWD and PACK can be read.
   * - All other pages can be read/write without authentication.
   * - The counter of NTAG can be read without authentication.
   * @param enable - The magic mode of actived slot.
   * @group Mifare Ultralight Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdMfuSetMagicMode(false)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuSetMagicMode (enable: boolean | number): Promise<void> {
    if (_.isNil(enable)) throw new TypeError('enable is required')
    const cmd = Cmd.MF0_NTAG_SET_UID_MAGIC_MODE // cmd = 4020
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!?', enable) })
    await readResp()
  }

  /**
   * Get the page data of actived slot.
   * @param offset - The start page of actived slot.
   * @param length - The count of pages to be get. Must satisfy: `1 <= length <= 128`.
   * @group Mifare Ultralight Related
   * @returns The page data of actived slot.
   * @example
   * ```js
   * async function run (ultra) {
   *   const data = await ultra.cmdMfuReadEmuPage(1)
   *   console.log(data.toString('hex')) // 'fa5c6480'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuReadEmuPage (offset: number = 0, length: number = 1): Promise<Buffer> {
    if (!_.inRange(length, 1, 129)) throw new TypeError('length must be in range [1, 128]')
    const cmd = Cmd.MF0_NTAG_READ_EMU_PAGE_DATA // cmd = 4021
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!BB', offset, length) })
    return (await readResp()).data
  }

  /**
   * Set the page data of actived slot.
   * @param offset - The start page of actived slot.
   * @param data - The data to be write. Length of data must be multiples of 4 and satisfy: `4 <= data.length <= 508`.
   * @group Mifare Ultralight Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdMfuWriteEmuPage(1, Buffer.from('fa5c6480', 'hex'))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuWriteEmuPage (offset: number, data: Buffer): Promise<void> {
    if (!_.isSafeInteger(offset)) throw new TypeError('Invalid offset')
    if (!Buffer.isBuffer(data)) throw new TypeError('data must be a Buffer')
    if (!_.inRange(data.length, 4, 509)) throw new TypeError('data.length must be in range [4, 508]')
    const pageSize = Math.trunc(data.length / 4)
    if (data.length !== pageSize * 4) throw new TypeError('data.length must be multiples of 4')
    const cmd = Cmd.MF0_NTAG_WRITE_EMU_PAGE_DATA // cmd = 4022
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack(`!BB${data.length}s`, offset, pageSize, data) })
    await readResp()
  }

  /**
   * Get the version of actived slot. The version is used to retrieve information on the NTAG family, the product version, storage size and other product data required to identify the specific NTAG21x.
   * @group Mifare Ultralight Related
   * @returns The version of actived slot.
   * @example
   * ```js
   * async function run (ultra) {
   *   const data = await ultra.cmdMfuGetEmuVersion()
   *   console.log(data.toString('hex')) // '0004040201001103'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuGetEmuVersion (): Promise<Buffer | undefined> {
    const cmd = Cmd.MF0_NTAG_GET_VERSION_DATA // cmd = 4023
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    const { data } = await readResp()
    return data.length > 0 ? data : undefined
  }

  /**
   * Set the version of actived slot. The version is used to retrieve information on the NTAG family, the product version, storage size and other product data required to identify the specific NTAG21x.
   * @param version - The version of actived slot.
   * @group Mifare Ultralight Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdMfuSetEmuVersion(Buffer.from('0004040201001103', 'hex'))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuSetEmuVersion (version: Buffer): Promise<void> {
    bufIsLenOrFail(version, 8, 'version')
    const cmd = Cmd.MF0_NTAG_SET_VERSION_DATA // cmd = 4024
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: version })
    await readResp()
  }

  /**
   * Get the signature of actived slot. NTAG21x features a cryptographically supported originality check. The signature is used to verify with a certain confidence that the tag is using an IC manufactured by NXP Semiconductors. The signature digital is based on standard Elliptic Curve Cryptography (curve name secp128r1), according to the ECDSA algorithm.
   * @group Mifare Ultralight Related
   * @returns The signature of actived slot.
   * @example
   * ```js
   * async function run (ultra) {
   *   const data = await ultra.cmdMfuGetEmuSignature()
   *   console.log(data.toString('hex')) // '0000000000000000000000000000000000000000000000000000000000000000'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuGetEmuSignature (): Promise<Buffer | undefined> {
    const cmd = Cmd.MF0_NTAG_GET_SIGNATURE_DATA // cmd = 4025
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    const { data } = await readResp()
    return data.length > 0 ? data : undefined
  }

  /**
   * Set the signature of actived slot. NTAG21x features a cryptographically supported originality check. The signature is used to verify with a certain confidence that the tag is using an IC manufactured by NXP Semiconductors. The signature digital is based on standard Elliptic Curve Cryptography (curve name secp128r1), according to the ECDSA algorithm.
   * @param signature - The signature. The signature must be a 32 bytes Buffer.
   * @group Mifare Ultralight Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const signature = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex')
   *   await ultra.cmdMfuSetEmuSignature(signature)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuSetEmuSignature (signature: Buffer): Promise<void> {
    bufIsLenOrFail(signature, 32, 'signature')
    const cmd = Cmd.MF0_NTAG_SET_SIGNATURE_DATA // cmd = 4026
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: signature })
    await readResp()
  }

  /**
   * Read the counter and tearing of actived slot.
   *
   * NTAG21x features a NFC counter function. The NFC counter is enabled or disabled with the NFC_CNT_EN bit. This function enables NTAG21x to automatically increase the 24 bit counter value, triggered by the first valid READ or FAST_READ command after the NTAG21x tag is powered by an RF field.
   * @param addr - The address of the counter.
   * @group Mifare Ultralight Related
   * @returns
   * - counter: The counter of the specified address.
   * - tearing: The slot is in tearing mode or not.
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdMfuGetEmuCounter(0))
   *   // { "counter": 0, "tearing": false }
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuGetEmuCounter (addr: number): Promise<{ counter?: number, tearing?: boolean }> {
    if (!_.includes([0, 1, 2], addr)) throw new TypeError('Invalid addr')
    const cmd = Cmd.MF0_NTAG_GET_COUNTER_DATA // cmd = 4027
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: Buffer.pack('!B', addr) })
    const { data } = await readResp()
    if (data.length !== 4) return { counter: undefined, tearing: undefined }
    const [counter, tearing] = [data.readUIntBE(0, 3), data[3] === 0x00]
    return { counter, tearing }
  }

  /**
   * Set the counter and reset tearing of actived slot.
   *
   * NTAG21x features a NFC counter function. The NFC counter is enabled or disabled with the NFC_CNT_EN bit. This function enables NTAG21x to automatically increase the 24 bit counter value, triggered by the first valid READ or FAST_READ command after the NTAG21x tag is powered by an RF field.
   * @param opts.addr - The address of the counter.
   * @param opts.counter - The counter to be write. The counter must be a 24-bit unsigned integer.
   * @param opts.resetTearing - `true` to reset tearing.
   * @group Mifare Ultralight Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdMfuSetEmuCounter({ addr: 0, counter: 1 })
   *   console.log(await ultra.cmdMfuGetEmuCounter(0))
   *   // { "counter": 1, "tearing": false }
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuSetEmuCounter (opts: {
    addr?: number
    counter?: number
    resetTearing?: boolean
  }): Promise<void> {
    const { addr = 2, counter = 0, resetTearing = false } = opts
    if (!_.includes([0, 1, 2], addr)) throw new TypeError('Invalid addr')
    if (!_.isSafeInteger(counter) || !_.inRange(counter, 0x1000000)) throw new TypeError('Invalid counter')
    const data = new Buffer(4)
    data[0] = (resetTearing ? 0x80 : 0x00) + addr
    data.writeUIntBE(counter, 1, 3)
    const cmd = Cmd.MF0_NTAG_SET_COUNTER_DATA // cmd = 4028
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data })
    await readResp()
  }

  /**
   * Reset the authentication failed counter of actived slot.
   * @group Mifare Ultralight Related
   * @returns The original value of the unsuccessful auth counter before reset.
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdMfuResetEmuAuthFailedCounter()) // 0
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuResetEmuAuthFailedCounter (): Promise<number> {
    const cmd = Cmd.MF0_NTAG_RESET_AUTH_CNT // cmd = 4029
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0]
  }

  /**
   * Get the number of pages available in the actived slot.
   * @group Mifare Ultralight Related
   * @returns The number of pages available in the actived slot.
   * @example
   * ```js
   * async function run (ultra) {
   *   console.log(await ultra.cmdMfuGetEmuPageSize()) // 135
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMfuGetEmuPageSize (): Promise<number> {
    const cmd = Cmd.MF0_NTAG_GET_PAGE_COUNT // cmd = 4030
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data[0]
  }

  /**
   * A protected memory area can be accessed only after a successful password verification using the PWD_AUTH command. The AUTH0 configuration byte defines the protected area. It specifies the first page that the password mechanism protects. The level of protection can be configured using the PROT bit either for write protection or read/write protection. The PWD_AUTH command takes the password as parameter and, if successful, returns the password authentication acknowledge, PACK. By setting the AUTHLIM configuration bits to a value larger than 000b, the number of unsuccessful password verifications can be limited. Each unsuccessful authentication is then counted in a counter featuring anti-tearing support. After reaching the limit of unsuccessful attempts, the memory access specified in PROT, is no longer possible.
   * @param opts.autoSelect - `true` to enable auto-select, `false` to disable auto-select.
   * @param opts.keepRfField - `true` to keep RF field after auth, `false` to disable RF field.
   * @param opts.key - The password to be verified. The password must be a 4 bytes Buffer.
   * @group Mifare Ultralight Related
   * @returns The password authentication acknowledge, PACK
   */
  async mfuAuth (opts: {
    autoSelect?: boolean
    keepRfField?: boolean
    key: Buffer
    timeout?: number
  }): Promise<Buffer> {
    try {
      const { autoSelect = true, keepRfField = true, key, timeout } = opts
      if (!Buffer.isBuffer(key)) throw new TypeError('key must be a Buffer')
      if (key.length === 16) throw new Error('auth Ultralight-C is not implemented')
      if (key.length !== 4) throw new Error('key must be a 4 bytes Buffer.')
      const resp = await this.cmdHf14aRaw({
        appendCrc: true,
        autoSelect,
        data: Buffer.pack(`!B${key.length}s`, MfuCmd.PWD_AUTH, key),
        keepRfField,
        waitResponse: true,
        timeout,
      })
      try {
        return mfuCheckRespNakCrc16a(resp)
      } catch (err) {
        const resp = err?.data?.resp
        if (resp.length === 1 && resp[0] === 0x04) err.status = RespStatus.MF_ERR_AUTH
        throw err
      }
    } catch (err) {
      throw _.set(new Error(`Auth failed: ${err.message}`), 'originalError', err)
    }
  }

  /**
   * Read 4 pages (16 bytes) from Mifare Ultralight
   * @param opts.start - page number to read
   * @param opts.key - The password to be verified. The password must be a 4 bytes Buffer.
   * @returns 4 pages (16 bytes)
   * @group Mifare Ultralight Related
   * @see [MF0ICU1 MIFARE Ultralight contactless single-ticket IC](https://www.nxp.com/docs/en/data-sheet/MF0ICU1.pdf#page=16)
   * @example
   * ```js
   * async function run (ultra) {
   *   const data = await ultra.mfuReadPages({ start: 0 })
   *   console.log(data.toString('hex')) // '040dc445420d2981e7480000e1100600'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuReadPages (opts: { key?: Buffer, start: number, timeout?: number }): Promise<Buffer> {
    const { key, start, timeout } = opts
    if (!_.isSafeInteger(start)) throw new TypeError('Invalid start')
    if (!_.isNil(key)) await this.mfuAuth({ keepRfField: true, key })
    return await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: _.isNil(key),
      checkResponseCrc: true,
      data: Buffer.pack('!BB', MfuCmd.READ, start),
      timeout,
    })
  }

  /**
   * Read multiple pages from start to end. For example if the start address is 0x03 and the end address is 0x07 then pages 0x03, 0x04, 0x05, 0x06 and 0x07 are returned. If the addressed page is outside of accessible area, NTAG21x replies a NAK.
   * @param opts.start -  start page address
   * @param opts.end - end page address
   * @param opts.key - The password to be verified. The password must be a 4 bytes Buffer.
   * @returns 4 pages (16 bytes)
   * @group Mifare Ultralight Related
   * @see [MF0ICU1 MIFARE Ultralight contactless single-ticket IC](https://www.nxp.com/docs/en/data-sheet/MF0ICU1.pdf#page=16)
   * @example
   * ```js
   * async function run (ultra) {
   *   const data = await ultra.mfuFastReadPages({ start: 0, end: 3 })
   *   console.log(data.toString('hex')) // '047c79896cb62a8171480000e1103e00'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuFastReadPages (opts: { key?: Buffer, start: number, end: number, timeout?: number }): Promise<Buffer> {
    const { end, key, start, timeout } = opts
    if (!_.isSafeInteger(start) || start < 0 || start > end) throw new TypeError('Invalid start')
    if (!_.isSafeInteger(end) || end < start || end > 0xFF) throw new TypeError('Invalid end')
    if (!_.isNil(key)) await this.mfuAuth({ keepRfField: true, key })
    return await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: _.isNil(key),
      checkResponseCrc: true,
      data: Buffer.pack('!BBB', MfuCmd.FAST_READ, start, end),
      timeout,
    })
  }

  /**
   * Detect Mifare Ultralight tag and return the tag infomation.
   * @returns The tag infomation of detected tag.
   * @group Mifare Ultralight Related
   * @see [Proxmark3 `hf mfu info`](https://github.com/RfidResearchGroup/proxmark3/blob/4e0d4d3ad454285e62fc1a22c2ef3adda508ed01/client/src/cmdhfmfu.c#L2089)
   * @example
   * ```js
   * async function run (ultra) {
   *   const { MfuTagTypeName } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const MfuTagType = await ultra.mfuDetectTagType()
   *   console.log(`tagType = ${MfuTagTypeName.get(MfuTagType)}`)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuDetectTagType (): Promise<MfuTagType> {
    const timeout = 500
    const tags = await this.cmdHf14aScan()
    if (tags.length > 1) throw new Error('More than one tag detected.')
    else if (tags.length === 0) throw new Error('Tag not found.')

    const tag = tags[0]
    if (!(tag.atqa.readUint16LE(0) === 0x0044 && tag.sak[0] === 0x00)) throw new Error(`Unknown tag: atqa = ${toUpperHex(tag.atqa.toReversed())}, sak = ${toUpperHex(tag.sak)}`)

    if (tag.uid[0] === 0x05) { // Infinition MY-D tests, Exam high nibble
      const nib = tag.uid[1] >>> 4
      if (nib === 1) return MfuTagType.MY_D
      else if (nib === 2) return MfuTagType.MY_D_NFC
      else if (nib === 3) return MfuTagType.MY_D_MOVE
      else if (nib === 7) return MfuTagType.MY_D_MOVE_LEAN
      else return MfuTagType.UNKNOWN
    }

    // try GET_VERSION cmd
    // const ver1 = await this.mfuGetVersion({ timeout }).catch(err => { this.#emitErr(err) })
    const ver1 = await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: true,
      data: Buffer.pack('!B', MfuCmd.GET_VERSION),
      timeout,
    }).catch(err => { this.#emitErr(err) })
    // console.log(`ver1 = ${ver1?.toString('hex')}`)

    if (Buffer.isBuffer(ver1)) {
      if (ver1.length === 10) {
        let tagType: MfuTagType | undefined
        tagType = MfuVerToMfuTagType.get(toUpperHex(ver1.subarray(0, 8)))
        if (!_.isNil(tagType)) return tagType
        tagType = MfuVerToMfuTagType.get(toUpperHex(ver1.subarray(0, 7)))
        if (!_.isNil(tagType)) return tagType
        if (ver1[2] === 0x04) return MfuTagType.NTAG
        if (ver1[2] === 0x03) return MfuTagType.UL_EV1
      } else if (ver1.length === 1) return MfuTagType.UL_C
      else if (ver1.length === 0) return MfuTagType.UL
      else return MfuTagType.UNKNOWN
    }

    // try TDES_AUTH cmd (should has resp if it is a Ultralight-C)
    const auth1 = await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: true,
      data: Buffer.pack('!B', MfuCmd.TDES_AUTH),
      timeout,
    }).catch(err => { this.#emitErr(err) })
    // console.log(`auth1 = ${auth1?.toString('hex')}`)
    if (Buffer.isBuffer(auth1)) return MfuTagType.UL_C

    // try read page 0x26 (should error if it is a Ultralight)
    const read1 = await this.mfuReadPages({ start: 0x26, timeout }).catch(err => { this.#emitErr(err) })
    // console.log(`read1 = ${read1?.toString('hex')}`)
    if ((read1?.length ?? 0) === 0) return MfuTagType.UL

    // try read page 0x30 (should error if it is a ntag203)
    const read2 = await this.mfuReadPages({ start: 0x30, timeout }).catch(err => { this.#emitErr(err) })
    // console.log(`read2 = ${read2?.toString('hex')}`)
    if ((read2?.length ?? 0) === 0) return MfuTagType.NTAG_203

    return MfuTagType.UNKNOWN
  }

  /**
   * Read the dump of Mifare Ultralight tag.
   * @param opts.key - The key to read pages if tag is read protected.
   * @param opts.pageEnd - The end page of Mifare Ultralight tag.
   * @param opts.pageOffset - The start page of Mifare Ultralight tag.
   * @returns The dump of Mifare Ultralight tag.
   * @group Mifare Ultralight Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const dump = await ultra.mfuReadDump()
   *   console.log(`Read ${dump.length} bytes.`) // Read 160 bytes.
   *   return dump
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuReadDump (opts: {
    key?: Buffer
    pageEnd?: number
    start?: number
  } = {}): Promise<Buffer> {
    const { key, pageEnd = 0x100, start = 0 } = opts
    const dump = new Buffer(4 * (pageEnd - start))
    let dumpOffset = 0
    try { // read until error
      while (dumpOffset < dump.length) {
        let buf1 = await this.mfuReadPages({ key, start: start + (dumpOffset / 4) })
        if (buf1.length === 0) break
        if (buf1.length > dump.length - dumpOffset) buf1 = buf1.subarray(0, dump.length - dumpOffset)
        dump.set(buf1, dumpOffset)
        dumpOffset += buf1.length
      }
    } catch (err) {
      this.#emitErr(err)
    }
    return dump.subarray(0, dumpOffset)
  }

  /**
   * Assert the tag type of actived slot is Mifare Ultralight like. Throw an error if the tag type is not Mifare Ultralight like.
   * @returns The tag type of actived slot.
   * @group Mifare Ultralight Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { TagType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const tagType = await ultra.mfuAssertEmuTagType()
   *   console.log(TagType[tagType]) // '040dc445420d2981e7480000e1100600'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuAssertEmuTagType (): Promise<TagType> {
    const slot = await this.cmdSlotGetActive()
    const slotInfo = await this.cmdSlotGetInfo()
    const { hfTagType } = slotInfo[slot]
    if (!isMfuEmuTagType(hfTagType)) throw new Error(`Invalid tagType: ${TagType[hfTagType]}`)
    return hfTagType
  }

  /**
   * Get the mifare ultralight settings of actived emulator slot.
   * @group Mifare Ultralight Related
   * @returns
   * - counters: The value of the NFC one-way counter.
   * - magic: The magic mode.
   * - pageSize: The page size.
   * - signature: The IC specific, 32-byte ECC signature.
   * - tearing: The slot is in tearing mode or not.
   * - version: The version information for the specific NTAG21x type.
   * @example
   * ```js
   * async function run (ultra) {
   *   const data = await ultra.mfuGetEmuSettings()
   *   console.log(data)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuGetEmuSettings (): Promise<{
    counters: Array<number | undefined>
    magic?: boolean
    pageSize?: number
    signature?: Buffer
    tearing?: boolean
    version?: Buffer
  }> {
    await this.mfuAssertEmuTagType()
    const catchErr = (err: Error): undefined => { this.#emitErr(err) }
    const magic = await this.cmdMfuGetMagicMode().catch(catchErr)
    const pageSize = await this.cmdMfuGetEmuPageSize().catch(catchErr)
    const signature = await this.cmdMfuGetEmuSignature().catch(catchErr)
    const version = await this.cmdMfuGetEmuVersion().catch(catchErr)
    let tearing: boolean | undefined
    const counters: Array<number | undefined> = []
    for (let i = 0; i < 3; i++) {
      const counter = await this.cmdMfuGetEmuCounter(i).catch(catchErr)
      counters.push(counter?.counter)
      tearing ??= counter?.tearing
    }
    return { counters, magic, pageSize, signature, tearing, version }
  }

  /**
   * The READ_CNT command is used to read out the current value of the NFC one-way counter of the Mifare Ultralight. The command has a single argument specifying the counter number and returns the 24-bit counter value of the corresponding counter. If the NFC_CNT_PWD_PROT bit is set to 1b the counter is password protected and can only be read with the READ_CNT command after a previous valid password authentication.
   * @param opts.addr - The counter addr to read. Must be `0`, `1` or `2`. Default is `2`.
   * @param opts.key - The password to be verified. The password must be a 4 bytes Buffer.
   * @group Mifare Ultralight Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const cnt = await ultra.mfuReadCounter({ addr: 2 })
   *   console.log(cnt) // 0
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuReadCounter (opts: { addr?: number, key?: Buffer }): Promise<number> {
    const { addr = 2, key } = opts
    if (!_.includes([0, 1, 2], addr)) throw new TypeError('Invalid addr of counter')
    if (!_.isNil(key)) await this.mfuAuth({ keepRfField: true, key })
    const resp = await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: _.isNil(key),
      waitResponse: true,
      data: Buffer.pack('!BB', MfuCmd.READ_CNT, addr),
    })
    return mfuCheckRespNakCrc16a(resp).readUintLE(0, 3)
  }

  /**
   * The READ_SIG command returns an IC specific, 32-byte ECC signature, to verify NXP Semiconductors as the silicon vendor. The signature is programmed at chip production and cannot be changed afterwards.
   * @group Mifare Ultralight Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const data = await ultra.mfuReadSignature()
   *   console.log(data.toString('base64url')) // 'w9dq8MPprf1Ro-C1si32rg3y7cO8UChrtXlNyjLScS4'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuReadSignature (): Promise<Buffer> {
    const resp = await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: true,
      data: Buffer.pack('!BB', MfuCmd.READ_SIG, 0x00),
    })
    return mfuCheckRespNakCrc16a(resp)
  }

  /**
   * The GET_VERSION command is used to retrieve information on the NTAG family, the product version, storage size and other product data required to identify the specific NTAG21x. This command is also available on other NTAG products to have a common way of identifying products across platforms and evolution steps. The GET_VERSION command has no arguments and replies the version information for the specific NTAG21x type.
   * @group Mifare Ultralight Related
   * @returns
   * -  response for NTAG213, NTAG215 and NTAG216
   *
   * | Byte no. | Description | NTAG213 | NTAG215 | NTAG216 | Interpretation |
   * | --- | --- | --- | --- | --- | --- |
   * | 0 | fixed Header | 0x00 | 0x00 | 0x00 |  |
   * | 1 | vendor ID | 0x04 | 0x04 | 0x04 | NXP Semiconductors |
   * | 2 | product type | 0x04 | 0x04 | 0x04 | NTAG |
   * | 3 | product subtype | 0x02 | 0x02 | 0x02 | 50 pF |
   * | 4 | major product version | 0x01 | 0x01 | 0x01 | 1 |
   * | 5 | minor product version | 0x00 | 0x00 | 0x00 | V0 |
   * | 6 | storage size | 0x0F | 0x11 | 0x13 | [reference](https://www.nxp.com/docs/en/data-sheet/NTAG213_215_216.pdf#page=36) |
   * | 7 | protocol | 0x03 | 0x03 | 0x03 | ISO/IEC 14443-3 compliant |
   * @example
   * ```js
   * async function run (ultra) {
   *   const data = await ultra.mfuGetVersion()
   *   console.log(data.toString('hex')) // '0004040201001103'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuGetVersion (opts: { timeout?: number } = {}): Promise<Buffer> {
    const resp = await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: true,
      data: Buffer.pack('!B', MfuCmd.GET_VERSION),
      timeout: opts.timeout,
    })
    return mfuCheckRespNakCrc16a(resp)
  }

  /**
   * Write 1 page (4 bytes) to Mifare Ultralight
   * @param opts.pageOffset - page number to read
   * @param opts.data - `4 bytes`, the page data to be written.
   * @param opts.key - The password to be verified. The password must be a 4 bytes Buffer.
   * @group Mifare Ultralight Related
   * @see [MF0ICU1 MIFARE Ultralight contactless single-ticket IC](https://www.nxp.com/docs/en/data-sheet/MF0ICU1.pdf#page=17)
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const data = await ultra.mfuWritePage({ pageOffset: 9, data: Buffer.from('00000000', 'hex') })
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuWritePage (opts: { data: Buffer, key?: Buffer, pageOffset: number }): Promise<void> {
    const { data, key, pageOffset } = opts
    if (!_.isSafeInteger(pageOffset)) throw new TypeError('Invalid pageOffset')
    bufIsLenOrFail(data, 4, 'data')
    if (!_.isNil(key)) await this.mfuAuth({ keepRfField: true, key })
    await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: _.isNil(key),
      checkResponseCrc: true,
      data: Buffer.pack('!BB4s', MfuCmd.WRITE, pageOffset, data),
    })
  }

  /**
   * Get the mifare ultralight emulator data of actived slot.
   * @returns The mifare ultralight emulator data of actived slot.
   * @group Mifare Ultralight Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const dump = await ultra.mfuReadEmuDump()
   *   console.log(`Read ${dump.length} bytes.`)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuReadEmuDump (): Promise<Buffer> {
    const pageSize = await this.cmdMfuGetEmuPageSize()
    const dump = new Buffer(pageSize * 4)
    for (let i = 0; i < pageSize; i += 128) { // max length of resp is 512 bytes
      const buf1 = dump.subarray(i * 4)
      buf1.set(await this.cmdMfuReadEmuPage(i, Math.min(128, pageSize - i)))
    }
    return dump
  }

  /**
   * Write new dump to the actived slot.
   * @param dump - New dump to be write to actived slot.
   * @group Mifare Ultralight Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const dump = new Buffer(540) // Dump size of NTAG_213 is 540 bytes.
   *   dump.set(Buffer.from('04689571fa5c648042480fe0', 'hex'))
   *   dump.set(Buffer.from('040000ff00000000ffffffff', 'hex'), 524)
   *   await ultra.mfuWriteEmuDump(dump)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuWriteEmuDump (dump: Buffer): Promise<void> {
    const pageSize = await this.cmdMfuGetEmuPageSize()
    dump = dump.subarray(0, pageSize * 4) // truncate dump
    bufIsLenOrFail(dump, pageSize * 4, 'dump')
    for (let i = 0; i < pageSize; i += 127) { // max length of req is 512 bytes, (512 - 2) / 4 = 127
      const buf1 = dump.subarray(i * 4).subarray(0, 508) // 127 * 4
      await this.cmdMfuWriteEmuPage(i, buf1)
    }
  }

  /**
   * Set the em410x id of actived slot.
   * @param id - The em410x id of actived slot.
   * @group Emulator Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdEm410xSetEmuId(Buffer.from('deadbeef88', 'hex'))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdEm410xSetEmuId (id: Buffer): Promise<void> {
    bufIsLenOrFail(id, 5, 'id')
    const cmd = Cmd.EM410X_SET_EMU_ID // cmd = 5000
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd, data: id })
    await readResp()
  }

  /**
   * Get the em410x id of actived slot.
   * @returns The em410x id of actived slot.
   * @group Emulator Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const id = await ultra.cmdEm410xGetEmuId()
   *   console.log(id.toString('hex')) // 'deadbeef88'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdEm410xGetEmuId (): Promise<Buffer> {
    const cmd = Cmd.EM410X_GET_EMU_ID // cmd = 5001
    const readResp = await this.#createReadRespFn({ cmd })
    await this.#sendCmd({ cmd })
    return (await readResp()).data
  }

  /**
   * Check if the firmware version is supported by SDK.
   * @returns `true` if the firmware version is supported, `false` otherwise.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   if (await ultra.isSupportedAppVersion()) throw new Error('Firmware version is not supported. Please update the firmware.')
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async isSupportedAppVersion (): Promise<boolean> {
    const version = await this.cmdGetAppVersion()
    return versionCompare(version, VERSION_SUPPORTED.gte) >= 0 && versionCompare(version, VERSION_SUPPORTED.lt) < 0
  }

  /**
   * Send Mifare Classic HALT command and close RF field.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.mf1Halt()
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mf1Halt (): Promise<void> {
    await this.cmdHf14aRaw({ appendCrc: true, data: Buffer.pack('!H', 0x5000), waitResponse: false }) // HALT + close RF field
  }

  /**
   * Magic auth helper function for mifare gen1a tag.
   * @param cb - The callback function to be executed after auth.
   * @returns The result of callback function.
   * @group Mifare Classic Related
   */
  async _mf1Gen1aAuth<T extends (...args: any) => any> (cb: T): Promise<Awaited<ReturnType<T>>> {
    try {
      if (_.isNil(cb)) throw new TypeError('cb is required')
      await this.mf1Halt()
      const resp1 = await this.cmdHf14aRaw({ data: Buffer.pack('!B', 0x40), dataBitLength: 7, keepRfField: true }) // 0x40 (7)
        .catch(err => { throw _.merge(new Error(`Gen1a auth failed 1: ${err.message}`), { originalError: err }) })
      if (resp1[0] !== 0x0A) throw new Error('Gen1a auth failed 1')
      const resp2 = await this.cmdHf14aRaw({ data: Buffer.pack('!B', 0x43), keepRfField: true }) // 0x43
        .catch(err => { throw _.merge(new Error(`Gen1a auth failed 2: ${err.message}`), { originalError: err }) })
      if (resp2[0] !== 0x0A) throw new Error('Gen1a auth failed 2')
      return await cb()
    } finally {
      if (this.isConnected()) await this.mf1Halt()
    }
  }

  /**
   * Read blocks from Mifare Classic Gen1a.
   * @param offset - The start block of Mifare Classic Gen1a.
   * @param length - The amount of blocks to read.
   * @returns The blocks data.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const card = await ultra.mf1Gen1aReadBlocks(0, 64)
   *   console.log(_.map(card.chunk(16), chunk => chunk.toString('hex')).join('\n'))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mf1Gen1aReadBlocks (offset: number, length: number = 1): Promise<Buffer> {
    if (!_.isSafeInteger(offset)) throw new TypeError('Invalid offset')
    if (!_.isSafeInteger(length)) throw new TypeError('Invalid length')
    return await this._mf1Gen1aAuth(async () => {
      const buf = new Buffer(length * 16)
      for (let i = 0; i < length; i++) {
        buf.set(await this.cmdHf14aRaw({
          appendCrc: true,
          checkResponseCrc: true,
          data: Buffer.pack('!BB', 0x30, offset + i),
          keepRfField: true,
        }), i * 16)
      }
      return buf
    })
  }

  /**
   * Write blocks to Mifare Classic Gen1a.
   * @param offset - The start block of Mifare Classic Gen1a.
   * @param data - The blocks data to write.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.mf1Gen1aWriteBlocks(1, new Buffer(16))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mf1Gen1aWriteBlocks (offset: number, data: Buffer): Promise<void> {
    if (!_.isSafeInteger(offset)) throw new TypeError('Invalid offset')
    if (!Buffer.isBuffer(data) || data.length % 16 !== 0) throw new TypeError('data must be a Buffer with length be multiples of 16')
    await this._mf1Gen1aAuth(async () => {
      const blocks = data.chunk(16)
      for (let i = 0; i < blocks.length; i++) {
        const resp1 = await this.cmdHf14aRaw({ appendCrc: true, data: Buffer.pack('!BB', 0xA0, offset + i), keepRfField: true })
        if (resp1[0] !== 0x0A) throw new Error('Gen1a write failed 1')
        const resp2 = await this.cmdHf14aRaw({ appendCrc: true, data: blocks[i], keepRfField: true })
        if (resp2[0] !== 0x0A) throw new Error('Gen1a write failed 2')
      }
    })
  }

  /**
   * Get the blockNo of sector trailer.
   * @param sector - The sector number.
   * @returns The blockNo of sector trailer.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run () {
   *   const { ChameleonUltra } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   console.log(ChameleonUltra.mf1TrailerBlockNoOfSector(0))
   *   // 3
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  static mf1TrailerBlockNoOfSector (sector: number): number {
    return sector < 32 ? sector * 4 + 3 : sector * 16 - 369
  }

  /**
   * Given a list of keys, check which is the correct key A and key B of the sector.
   * @param sector - The sector number to be checked.
   * @param keys - The keys dictionary.
   * @returns The Key A and Key B of the sector.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const keys = Buffer.from('FFFFFFFFFFFF\n000000000000\nA0A1A2A3A4A5\nD3F7D3F7D3F7', 'hex').chunk(6)
   *   const sectorKey = await ultra.mf1CheckSectorKeys(0, keys)
   *   console.log(_.mapValues(sectorKey, key => key.toString('hex')))
   *   // { "96": "ffffffffffff", "97": "ffffffffffff" }
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mf1CheckSectorKeys (sector: number, keys: Buffer[]): Promise<{
    [Mf1KeyType.KEY_A]?: Buffer
    [Mf1KeyType.KEY_B]?: Buffer
  }> {
    if (!_.isSafeInteger(sector)) throw new TypeError('Invalid sector')
    const mask = Buffer.alloc(10, 0xFF)
    mask[sector >>> 2] ^= 3 << (6 - sector % 4 * 2)
    const [ka, kb] = (await this.mf1CheckKeysOfSectors({ keys, mask })).slice(sector * 2, sector * 2 + 2)
    return {
      ...(_.isNil(ka) ? {} : { [Mf1KeyType.KEY_A]: ka }),
      ...(_.isNil(kb) ? {} : { [Mf1KeyType.KEY_B]: kb }),
    }
  }

  /**
   * Mifare Classic check keys of sectors.
   * @param opts.chunkSize - `keys` will be chunked by this size.
   * @param opts.keys - The keys to be checked.
   * @param opts.mask - The mask of sectors. 80 bits, 2 bits/sector, the first bit is key A, the second bit is key B, 0b1 represent to skip checking the key.
   * @param opts.maxSectors - The max sectors to be check.
   * @param opts.onChunkKeys - The callback function to be invoked before checking every chunk of keys.
   * @group Mifare Classic Related
   * @returns
   */
  async mf1CheckKeysOfSectors (opts: {
    chunkSize?: number
    keys: Buffer[]
    mask?: Buffer
    maxSectors?: number
    onChunkKeys?: (opts: { keys: Buffer[], mask: Buffer }) => Promise<unknown>
  }): Promise<Buffer[]> {
    let { chunkSize = 20, keys, mask = new Buffer(10), maxSectors = 40, onChunkKeys } = opts
    keys = _.chain(keys)
      .filter(key => Buffer.isBuffer(key) && key.length === 6)
      .uniqWith(Buffer.equals)
      .value()
    if (keys.length === 0) throw new TypeError('Invalid keys')
    if (!Buffer.isBuffer(mask)) mask = new Buffer(10)
    else if (mask.length !== 10) {
      const buf = new Buffer(10)
      buf.copy(mask, 0, 0, 10)
      mask = buf
    }
    // console.log({ chunkSize, keys, mask, maxSectors })
    for (let i = maxSectors ?? 40; i < 40; i++) mask[i >>> 2] |= 3 << (6 - i % 4 * 2)

    const foundKeys = new Array(maxSectors * 2).fill(null)
    for (const chunkKeys of _.chunk(keys, chunkSize)) {
      await onChunkKeys?.({ keys: chunkKeys, mask })
      const tmp = await this.cmdMf1CheckKeysOfSectors({ keys: chunkKeys, mask })
      if (_.isNil(tmp)) break // all founded
      for (let i = 0; i < 10; i++) mask[i] |= tmp.found[i]
      for (let i = 0; i < maxSectors * 2; i++) {
        if (_.isNil(tmp.sectorKeys[i])) continue
        foundKeys[i] = tmp.sectorKeys[i]
      }
    }
    return foundKeys
  }

  /**
   * Read the sector data of Mifare Classic by given keys.
   * @param sector - The sector number to be read.
   * @param keys - The keys dictionary.
   * @returns The sector data and the read status of each block.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const keys = Buffer.from('FFFFFFFFFFFF\n000000000000\nA0A1A2A3A4A5\nD3F7D3F7D3F7', 'hex').chunk(6)
   *   const { data, success } = await ultra.mf1ReadSectorByKeys(0, keys)
   *   console.log({ data: data.toString('hex'), success })
   *   // { "data": "...", "success": [true, true, true, true] }
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mf1ReadSectorByKeys (sector: number, keys: Buffer[]): Promise<{ data: Buffer, success: boolean[] }> {
    const sectorKey = await this.mf1CheckSectorKeys(sector, keys)
    if (_.isEmpty(sectorKey)) throw new Error('No valid key')
    const data = new Buffer(64)
    const success = _.times(4, () => false)
    for (let i = 0; i < 4; i++) {
      for (const keyType of [Mf1KeyType.KEY_B, Mf1KeyType.KEY_A]) {
        const key = sectorKey[keyType]
        if (_.isNil(key)) continue
        try {
          data.set(await this.cmdMf1ReadBlock({ block: sector * 4 + i, keyType, key }), i * 16)
          success[i] = true
          break
        } catch (err) {
          if (!this.isConnected()) throw err
          this.#debug('mf1', `Failed to read block ${sector * 4 + i} with ${Mf1KeyType[keyType]} = ${key.toString('hex')}`)
        }
      }
    }
    if (!_.isNil(sectorKey[Mf1KeyType.KEY_A])) data.set(sectorKey[Mf1KeyType.KEY_A], 48)
    if (!_.isNil(sectorKey[Mf1KeyType.KEY_B])) data.set(sectorKey[Mf1KeyType.KEY_B], 58)
    return { data, success }
  }

  /**
   * Write the sector data of Mifare Classic by given keys.
   * @param sector - The sector number to be written.
   * @param keys - The key dictionary.
   * @param data - Sector data
   * @returns the write status of each block.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const keys = Buffer.from('FFFFFFFFFFFF\n000000000000\nA0A1A2A3A4A5\nD3F7D3F7D3F7', 'hex').chunk(6)
   *   const data = Buffer.concat([
   *     Buffer.from('00000000000000000000000000000000', 'hex'),
   *     Buffer.from('00000000000000000000000000000000', 'hex'),
   *     Buffer.from('00000000000000000000000000000000', 'hex'),
   *     Buffer.from('ffffffffffffff078069ffffffffffff', 'hex'),
   *   ])
   *   const { success } = await ultra.mf1WriteSectorByKeys(1, keys, data)
   *   console.log(success)
   *   // [true, true, true, true]
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mf1WriteSectorByKeys (sector: number, keys: Buffer[], data: Buffer): Promise<{ success: boolean[] }> {
    bufIsLenOrFail(data, 64, 'data')
    if (!this.mf1IsValidAcl(data)) throw new TypeError('Invalid ACL bytes of data')
    const sectorKey = await this.mf1CheckSectorKeys(sector, keys)
    if (_.isEmpty(sectorKey)) throw new Error('No valid key')
    const success = _.times(4, () => false)
    for (let i = 0; i < 4; i++) {
      for (const keyType of [Mf1KeyType.KEY_B, Mf1KeyType.KEY_A]) {
        const key = sectorKey[keyType]
        if (_.isNil(key)) continue
        try {
          await this.cmdMf1WriteBlock({ block: sector * 4 + i, keyType, key, data: data.slice(i * 16, i * 16 + 16) })
          success[i] = true
          break
        } catch (err) {
          if (!this.isConnected()) throw err
          this.#debug('mf1', `Failed to write block ${sector * 4 + i} with ${Mf1KeyType[keyType]} = ${key.toString('hex')}`)
        }
      }
    }
    return { success }
  }

  /**
   * Check acl bytes of ACL, block or sector.
   * @param data - Data of ACL, block or sector.
   * @returns `true` if the acl bytes is valid, `false` otherwise.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   console.log(ultra.mf1IsValidAcl(Buffer.from('ff078069', 'hex'))) // true
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  mf1IsValidAcl (data: Buffer): boolean {
    if (!Buffer.isBuffer(data) || !_.includes([3, 4, 16, 64], data.length)) throw new TypeError('data must be a Buffer with length 3, 4, 16 or 64')
    if (data.length === 16) data = data.subarray(6)
    else if (data.length === 64) data = data.subarray(54)

    const acl: number[] = []
    for (let i = 0; i < 3; i++) acl.push((data[i] & 0xF0) >>> 4, data[i] & 0x0F)
    return _.every([[1, 2], [0, 5], [3, 4]], ([a, b]: [number, number]) => (acl[a] ^ acl[b]) === 0xF)
  }

  /**
   * Retrieve DFU protocol version.
   *
   * Syntax and ID of this command is permanent. If protocol version changes other opcode may not be valid any more.
   * @returns Protocol version.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdDfuEnter()
   *   console.log(await ultra.cmdDfuGetProtocol()) // Print: 1
   *   await ultra.cmdDfuAbort()
   * }
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdDfuGetProtocol (): Promise<number> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    const op = DfuOp.PROTOCOL_VERSION
    const readResp = await this.#createReadRespFn({ op })
    await this.#sendBuffer(Buffer.pack('<B', op))
    return (await readResp()).data[0]
  }

  /**
   * Create selected object.
   * @param type - Object type.
   * @param size - Object size in bytes.
   * @returns
   * - `crc32`: Current CRC.
   * - `offset`: Current offset.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   */
  async cmdDfuCreateObject (type: DfuObjType, size: number): Promise<void> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    if (!isValidDfuObjType(type)) throw new TypeError('Invalid type')
    const op = DfuOp.OBJECT_CREATE
    const readResp = await this.#createReadRespFn({ op })
    await this.#sendBuffer(Buffer.pack('<BBI', op, type, size))
    await readResp()
  }

  /**
   * Set receipt notification
   *
   * This request configures the frequency of sending CRC responses after Write request commands.
   * @param prn - If set to `0`, then the CRC response is never sent after Write request. Otherwise, it is sent every `prn`'th Write request.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   */
  async cmdDfuSetPrn (prn: number): Promise<void> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    const op = DfuOp.RECEIPT_NOTIF_SET
    const readResp = await this.#createReadRespFn({ op })
    await this.#sendBuffer(Buffer.pack('<BI', op, prn))
    await readResp()
  }

  /**
   * Request CRC of selected object.
   * @returns
   * - `crc32`: Current CRC.
   * - `offset`: Current offset.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   */
  async cmdDfuGetObjectCrc (): Promise<{ offset: number, crc32: number }> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    const op = DfuOp.CRC_GET
    const readResp = await this.#createReadRespFn({ op })
    await this.#sendBuffer(Buffer.pack('<B', op))
    const [offset, crc32] = (await readResp()).data.unpack('<II')
    return { offset, crc32 }
  }

  /**
   * Execute selected object.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   */
  async cmdDfuExecuteObject (): Promise<void> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    const op = DfuOp.OBJECT_EXECUTE
    const readResp = await this.#createReadRespFn({ op })
    await this.#sendBuffer(Buffer.pack('<B', op))
    await readResp()
  }

  /**
   * Select object.
   * @param type - Object type.
   * @returns
   * - `crc32`: Current CRC.
   * - `maxSize`: Maximum size of selected object.
   * - `offset`: Current offset.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   */
  async cmdDfuSelectObject (type: DfuObjType): Promise<{ offset: number, crc32: number, maxSize: number }> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    if (!isValidDfuObjType(type)) throw new TypeError('Invalid type')
    const op = DfuOp.OBJECT_SELECT
    const readResp = await this.#createReadRespFn({ op })
    await this.#sendBuffer(Buffer.pack('<BB', op, type))
    const [maxSize, offset, crc32] = (await readResp()).data.unpack('<III')
    return { crc32, maxSize, offset }
  }

  /**
   * Retrieve MTU size.
   * @returns The preferred MTU size on this request.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdDfuEnter()
   *   console.log(await ultra.cmdDfuGetMtu()) // Print: 1025
   *   await ultra.cmdDfuAbort()
   * }
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdDfuGetMtu (): Promise<number> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    const op = DfuOp.MTU_GET
    const readResp = await this.#createReadRespFn({ op })
    await this.#sendBuffer(Buffer.pack('<B', op))
    const respData = (await readResp()).data
    const mtu = respData.length >= 2 ? respData.readUInt16LE(0) : 21
    return this.isSlip() ? Math.trunc((mtu - 1) / 2) : mtu // slip encode/decode
  }

  /**
   * Write selected object.
   * @param buf - Data.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   */
  async cmdDfuWriteObject (buf: Buffer): Promise<void> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    const op = DfuOp.OBJECT_WRITE
    await this.#sendBuffer(Buffer.pack(`<B${buf.length}s`, op, buf))
  }

  /**
   * Ping.
   * @param id - Ping ID that will be returned in response.
   * @returns The received ID which is echoed back.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdDfuEnter()
   *   console.log(await ultra.cmdDfuPing(1)) // Print: 1
   *   await ultra.cmdDfuAbort()
   * }
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdDfuPing (id: number): Promise<number> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    const op = DfuOp.PING
    const readResp = await this.#createReadRespFn({ op })
    await this.#sendBuffer(Buffer.pack('<BB', op, id))
    return (await readResp()).data[0]
  }

  /**
   * Retrieve hardware version.
   * @returns
   * - `part`: Hardware part, from FICR register.
   * - `ramSize`: RAM size, in bytes.
   * - `romPageSize`: ROM flash page size, in bytes.
   * - `romSize`: ROM size, in bytes.
   * - `variant`: Hardware variant, from FICR register.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdDfuEnter()
   *   console.log(await ultra.cmdDfuGetHardwareVersion())
   *   await ultra.cmdDfuAbort()
   *   // {
   *   //   "part": "nRF52840",
   *   //   "variant": "AAD0",
   *   //   "romSize": 1048576,
   *   //   "ramSize": 262144,
   *   //   "romPageSize": 4096
   *   // }
   * }
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdDfuGetHardwareVersion (): Promise<{
    part: string
    variant: string
    romSize: number
    ramSize: number
    romPageSize: number
  }> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    const op = DfuOp.HARDWARE_VERSION
    const readResp = await this.#createReadRespFn({ op })
    await this.#sendBuffer(Buffer.pack('<B', op))
    const [part, variant, romSize, ramSize, romPageSize] = (await readResp()).data.unpack('<I4sIII')
    return { part: `nRF${part.toString(16)}`, variant: variant.toReversed().toString(), romSize, ramSize, romPageSize }
  }

  /**
   * Retrieve firmware version.
   * @returns
   * - `addr`: Firmware address in flash.
   * - `len`: Firmware length in bytes.
   * - `type`: Firmware type.
   * - `version`: Firmware version.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   * @example
   * ```js
   * async function run (ultra) {
   *   const { DfuFwId, DfuFwType } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   await ultra.cmdDfuEnter()
   *   for (const fwId of [DfuFwId.BOOTLOADER, DfuFwId.APPLICATION, DfuFwId.SOFTDEVICE]) {
   *     const { type, version, addr, len } = await ultra.cmdDfuGetFirmwareVersion(fwId)
   *     console.log(`type = ${DfuFwType[type]}, version = ${version}, addr = 0x${addr.toString(16)}, len = ${len}`)
   *   }
   *   await ultra.cmdDfuAbort()
   *   // type = BOOTLOADER, version = 1, addr = 0xf3000, len = 45056
   *   // type = SOFTDEVICE, version = 7002000, addr = 0x1000, len = 159744
   *   // type = APPLICATION, version = 1, addr = 0x27000, len = 222844
   * }
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdDfuGetFirmwareVersion (id: DfuFwId): Promise<{
    type: DfuFwType
    version: number
    addr: number
    len: number
  }> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    if (!isDfuFwId(id)) throw new TypeError('Invalid id')
    const op = DfuOp.FIRMWARE_VERSION
    const readResp = await this.#createReadRespFn({ op })
    await this.#sendBuffer(Buffer.pack('<BB', op, id))
    const [type, version, addr, len] = (await readResp()).data.unpack('<BIII')
    return { type, version, addr, len }
  }

  /**
   * Abort the DFU procedure.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdDfuEnter()
   *   await ultra.cmdDfuAbort()
   * }
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdDfuAbort (): Promise<void> {
    if (!this.isConnected()) await this.connect()
    if (!this.isDfu()) throw new Error('Please enter DFU mode first.')
    const op = DfuOp.ABORT
    await this.#sendBuffer(Buffer.pack('<B', op))
  }

  /**
   * DFU: Upload object of image.
   * @param type - Object type.
   * @param buf - Data.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   */
  async dfuUpdateObject (type: DfuObjType, buf: Buffer): Promise<void> {
    if (!isValidDfuObjType(type)) throw new TypeError('Invalid type')
    const emitProgress = (offset: number): void => {
      this.emitter.emit('progress', {
        func: 'dfuUpdateObject',
        offset,
        size: buf.length,
        type,
      })
    }
    const uploaded = await this.cmdDfuSelectObject(type)
    this.#debug('core', `uploaded = ${JSON.stringify(uploaded)}`)
    let buf1 = buf.subarray(0, uploaded.offset)
    let crc1 = { offset: buf1.length, crc32: crc32(buf1) }
    let crcFailCnt = 0
    if (!_.isMatch(uploaded, crc1)) { // abort
      this.#debug('core', 'aborted')
      await this.cmdDfuAbort()
      Object.assign(uploaded, await this.cmdDfuSelectObject(type))
    }
    emitProgress(uploaded.offset)
    const mtu = await this.cmdDfuGetMtu() - 1
    while (uploaded.offset < buf.length) {
      buf1 = buf.subarray(uploaded.offset).subarray(0, uploaded.maxSize)
      await this.cmdDfuCreateObject(type, buf1.length)
      // write object
      for (const buf2 of buf1.chunk(mtu)) await this.cmdDfuWriteObject(buf2)
      // check crc
      const crc2 = { offset: uploaded.offset + buf1.length, crc32: crc32(buf1, uploaded.crc32) }
      crc1 = await this.cmdDfuGetObjectCrc()
      if (!_.isMatch(crc1, crc2)) {
        crcFailCnt++
        if (crcFailCnt > 10) throw new Error('crc32 check failed 10 times')
        continue
      }
      await this.cmdDfuExecuteObject()
      Object.assign(uploaded, crc1)
      crcFailCnt = 0
      emitProgress(uploaded.offset)
    }
  }

  /**
   * Upload DFU image.
   * @param image - The DFU image.
   * @group DFU Related
   * @see Please refer to {@link https://docs.nordicsemi.com/bundle/sdk_nrf5_v17.1.0/page/lib_dfu_transport.html | nRF5 SDK: DFU Protocol} for more infomation.
   * @example
   * ```js
   * async function run (ultra) {
   *   const { DeviceModel } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
   *   const { default: DfuZip } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/plugin/DfuZip.mjs/+esm')
   *   const model = (await ultra.cmdGetDeviceModel()) === DeviceModel.ULTRA ? 'ultra' : 'lite'
   *   const dfuZipUrl = `https://taichunmin.idv.tw/ChameleonUltra-releases/dev/${model}-dfu-app.zip`
   *   const dfuZip = new DfuZip(new Buffer((await axios.get(dfuZipUrl, { responseType: 'arraybuffer' }))?.data))
   *   const image = await dfuZip.getAppImage()
   *   const imageGitVersion = await dfuZip.getGitVersion()
   *   console.log({ type: image.type, headerSize: image.header.length, bodySize: image.body.length, gitVersion: imageGitVersion })
   *   // {
   *   //   "type": "application",
   *   //   "headerSize": 141,
   *   //   "bodySize": 222844,
   *   //   "gitVersion": "v2.0.0-135-g3cadd47"
   *   // }
   *   const gitVersion = await ultra.cmdGetGitVersion()
   *   console.log(`gitVersion = ${gitVersion}`) // Print: gitVersion = v2.0.0-135-g3cadd47
   *   await ultra.cmdDfuEnter()
   *   ultra.emitter.on('progress', console.log)
   *   // {
   *   //   "func": "dfuUpdateObject",
   *   //   "offset": 0,
   *   //   "size": 222844,
   *   //   "type": 2
   *   // }
   *   await ultra.dfuUpdateImage(image)
   *   ultra.emitter.removeListener('progress', console.log)
   * }
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async dfuUpdateImage (image: DfuImage): Promise<void> {
    await this.dfuUpdateObject(DfuObjType.COMMAND, image.header)
    await this.dfuUpdateObject(DfuObjType.DATA, image.body)
    for (let i = 500; i >= 0; i--) {
      if (!this.isConnected()) break
      if (i === 0) throw new Error('Failed to reboot device')
      await sleep(10)
    }
    this.#debug('core', 'rebooted')
  }
}

const RespStatusMsg = new Map([
  [RespStatus.HF_TAG_OK, 'HF tag operation succeeded'],
  [RespStatus.HF_TAG_NOT_FOUND, 'HF tag not found error'],
  [RespStatus.HF_ERR_STAT, 'HF tag status error'],
  [RespStatus.HF_ERR_CRC, 'HF tag data crc error'],
  [RespStatus.HF_COLLISION, 'HF tag collision'],
  [RespStatus.HF_ERR_BCC, 'HF tag uid bcc error'],
  [RespStatus.MF_ERR_AUTH, 'HF tag auth failed'],
  [RespStatus.HF_ERR_PARITY, 'HF tag data parity error'],
  [RespStatus.HF_ERR_ATS, 'HF tag was supposed to send ATS but didn\'t'],

  [RespStatus.LF_TAG_OK, 'LF tag operation succeeded'],
  [RespStatus.EM410X_TAG_NOT_FOUND, 'EM410x tag not found error'],

  [RespStatus.PAR_ERR, 'invalid param error'],
  [RespStatus.DEVICE_MODE_ERROR, 'wrong device mode error'],
  [RespStatus.INVALID_CMD, 'invalid cmd error'],
  [RespStatus.DEVICE_SUCCESS, 'Device operation succeeded'],
  [RespStatus.NOT_IMPLEMENTED, 'Not implemented error'],
  [RespStatus.FLASH_WRITE_FAIL, 'Flash write failed'],
  [RespStatus.FLASH_READ_FAIL, 'Flash read failed'],
  [RespStatus.INVALID_SLOT_TYPE, 'Invalid slot tagType'],
])

const DfuErrMsg = new Map<number, string>([
  // DFU operation result code.
  [DfuResCode.INVALID, 'Invalid opcode'],
  [DfuResCode.SUCCESS, 'Operation successful'],
  [DfuResCode.OP_CODE_NOT_SUPPORTED, 'Opcode not supported'],
  [DfuResCode.INVALID_PARAMETER, 'Missing or invalid parameter value'],
  [DfuResCode.INSUFFICIENT_RESOURCES, 'Not enough memory for the data object'],
  [DfuResCode.INVALID_OBJECT, 'Data object does not match the firmware and hardware requirements, the signature is wrong, or parsing the command failed'],
  [DfuResCode.UNSUPPORTED_TYPE, 'Not a valid object type for a Create request'],
  [DfuResCode.OPERATION_NOT_PERMITTED, 'The state of the DFU process does not allow this operation'],
  [DfuResCode.OPERATION_FAILED, 'Operation failed'],
  [DfuResCode.EXT_ERROR, 'Extended error'],

  // DFU extended error code.
  [DfuResCode.NO_ERROR, 'No extended error code has been set. This error indicates an implementation problem'],
  [DfuResCode.INVALID_ERROR_CODE, 'Invalid error code. This error code should never be used outside of development'],
  [DfuResCode.WRONG_COMMAND_FORMAT, 'The format of the command was incorrect. This error code is not used in the current implementation, because NRF_DFU_RES_CODE_OP_CODE_NOT_SUPPORTED and NRF_DFU_RES_CODE_INVALID_PARAMETER cover all possible format errors'],
  [DfuResCode.UNKNOWN_COMMAND, 'The command was successfully parsed, but it is not supported or unknown'],
  [DfuResCode.INIT_COMMAND_INVALID, 'The init command is invalid. The init packet either has an invalid update type or it is missing required fields for the update type (for example, the init packet for a SoftDevice update is missing the SoftDevice size field)'],
  [DfuResCode.FW_VERSION_FAILURE, 'The firmware version is too low. For an application or SoftDevice, the version must be greater than or equal to the current version. For a bootloader, it must be greater than the current version. to the current version. This requirement prevents downgrade attacks'],
  [DfuResCode.HW_VERSION_FAILURE, 'The hardware version of the device does not match the required hardware version for the update'],
  [DfuResCode.SD_VERSION_FAILURE, 'The array of supported SoftDevices for the update does not contain the FWID of the current SoftDevice or the first FWID is "0" on a bootloader which requires the SoftDevice to be present'],
  [DfuResCode.SIGNATURE_MISSING, 'The init packet does not contain a signature. This error code is not used in the current implementation, because init packets without a signature are regarded as invalid'],
  [DfuResCode.WRONG_HASH_TYPE, 'The hash type that is specified by the init packet is not supported by the DFU bootloader'],
  [DfuResCode.HASH_FAILED, 'The hash of the firmware image cannot be calculated'],
  [DfuResCode.WRONG_SIGNATURE_TYPE, 'The type of the signature is unknown or not supported by the DFU bootloader'],
  [DfuResCode.VERIFICATION_FAILED, 'The hash of the received firmware image does not match the hash in the init packet'],
  [DfuResCode.INSUFFICIENT_SPACE, 'The available space on the device is insufficient to hold the firmware'],
])

class UltraRxSink implements UnderlyingSink<Buffer> {
  #closed: boolean = false
  #started: boolean = false
  abortController: AbortController = new AbortController()
  bufs: Buffer[] = []
  readonly #ultra: ChameleonUltra

  constructor (ultra: ChameleonUltra) {
    this.#ultra = ultra
  }

  start (controller: WritableStreamDefaultController): void {
    if (this.#closed) throw new Error('UltraRxSink is closed')
    if (this.#started) throw new Error('UltraRxSink is already started')
    this.#ultra.emitter.emit('connected', new Date())
    this.#started = true
  }

  write (chunk: Buffer, controller: WritableStreamDefaultController): void {
    if (!this.#started || this.#closed) return
    if (!Buffer.isBuffer(chunk)) chunk = Buffer.fromView(chunk)
    this.bufs.push(chunk)
    let buf = Buffer.concat(this.bufs.splice(0, this.bufs.length))
    try {
      while (buf.length > 0) {
        const sofIdx = buf.indexOf(START_OF_FRAME)
        if (sofIdx < 0) break // end, SOF not found
        else if (sofIdx > 0) buf = buf.subarray(sofIdx) // ignore bytes before SOF
        // sof + sof lrc + cmd (2) + status (2) + data len (2) + head lrc + data + data lrc
        if (buf.length < 10) break // end, buf.length < 10
        if (bufLrc(buf.subarray(2, 8)) !== buf[8]) {
          buf = buf.subarray(1) // skip 1 byte, head lrc mismatch
          continue
        }
        const lenFrame = buf.readUInt16BE(6) + 10
        if (buf.length < lenFrame) break // end, wait for more data
        if (bufLrc(buf.subarray(9, lenFrame - 1)) !== buf[lenFrame - 1]) {
          buf = buf.subarray(1) // skip 1 byte, data lrc mismatch
          continue
        }
        this.#ultra.emitter.emit('resp', new UltraFrame(buf.slice(0, lenFrame)))
        buf = buf.subarray(lenFrame)
      }
    } finally {
      if (buf.length > 0) this.bufs.push(buf)
    }
  }

  close (): void {
    if (this.#closed) return
    this.#closed = true
    this.abortController.abort()
    this.#ultra.emitter.emit('disconnected', new Date())
  }

  abort (reason: any): void {
    if (this.#closed) return
    this.#closed = true
    this.abortController.abort()
    this.#ultra.emitter.emit('disconnected', new Date(), reason)
  }
}

class DfuRxSink implements UnderlyingSink<Buffer> {
  #closed: boolean = false
  #started: boolean = false
  abortController: AbortController = new AbortController()
  bufs: Buffer[] = []
  readonly #ultra: ChameleonUltra

  constructor (dfu: ChameleonUltra) {
    this.#ultra = dfu
  }

  start (controller: WritableStreamDefaultController): void {
    if (this.#closed) throw new Error('DfuRxSink is closed')
    if (this.#started) throw new Error('DfuRxSink is already started')
    this.#ultra.emitter.emit('connected', new Date())
    this.#started = true
  }

  write (chunk: Buffer, controller: WritableStreamDefaultController): void {
    if (!this.#started || this.#closed) return
    if (!Buffer.isBuffer(chunk)) chunk = Buffer.fromView(chunk)
    const resp = new DfuFrame(chunk)
    this.#ultra.emitter.emit('resp', resp)
  }

  close (): void {
    if (this.#closed) return
    this.#closed = true
    this.abortController.abort()
    this.#ultra.emitter.emit('disconnected', new Date())
  }

  abort (reason: any): void {
    if (this.#closed) return
    this.#closed = true
    this.abortController.abort()
    this.#ultra.emitter.emit('disconnected', new Date(), reason)
  }
}

export interface ChameleonSerialPort<I, O> {
  isDfu?: () => boolean
  isOpen?: () => boolean
  isSlip?: () => boolean
  readable: ReadableStream<I>
  writable: WritableStream<O>
}

/**
 * @internal
 * @group Internal
 */
export type PluginInstallContext = { // eslint-disable-line @typescript-eslint/consistent-type-definitions
  Buffer: typeof Buffer
  ultra: ChameleonUltra
}

/**
 * @internal
 * @group Internal
 */
export interface ChameleonPlugin {
  name: string
  install: <T extends PluginInstallContext>(context: T, pluginOption: any) => Promise<unknown>
}

class UltraFrame {
  buf: Buffer

  constructor (buf: Buffer | Uint8Array) {
    this.buf = Buffer.isBuffer(buf) ? buf : Buffer.fromView(buf)
  }

  static inspect (resp: UltraFrame): string {
    // sof + sof lrc + cmd (2) + status (2) + data len (2) + head lrc + data + data lrc
    const { buf } = resp
    return [
      buf.slice(0, 2).toString('hex'), // sof + sof lrc
      buf.slice(2, 4).toString('hex'), // cmd
      buf.slice(4, 6).toString('hex'), // status
      buf.slice(6, 8).toString('hex'), // data len
      buf.slice(8, 9).toString('hex'), // head lrc
      buf.readUInt16BE(6) > 0 ? buf.slice(9, -1).toString('hex') : '(no data)', // data
      buf.slice(-1).toString('hex'), // data lrc
    ].join(' ')
  }

  get cmd (): Cmd { return this.buf.readUInt16BE(2) }
  get data (): Buffer { return this.buf.subarray(9, -1) }
  get inspect (): string { return UltraFrame.inspect(this) }
  get status (): RespStatus { return this.buf.readUInt16BE(4) }
  get errMsg (): string | undefined {
    const status = this.status
    if (!isFailedRespStatus(status)) return
    return RespStatusMsg.get(status) ?? `Unknown status code: ${status}`
  }
}

export class DfuFrame {
  buf: Buffer

  constructor (buf: Buffer) {
    this.buf = buf // 60000101
  }

  static inspect (frame: DfuFrame): string {
    if (frame.isResp === 1) return `op = ${DfuOp[frame.op]}, resCode = ${DfuResCode[frame.result]}, data = ${frame.data.toString('hex')}`
    if (frame.op === DfuOp.OBJECT_WRITE) return `op = ${DfuOp[frame.op]}, data.length = ${frame.data.length}`
    return `op = ${DfuOp[frame.op]}, data = ${frame.data.toString('hex')}`
  }

  get isResp (): number { return +(this.buf[0] === DfuOp.RESPONSE) }
  get data (): Buffer { return this.buf.subarray(this.isResp === 1 ? 3 : 1) }
  get inspect (): string { return DfuFrame.inspect(this) }
  get op (): number { return this.buf[this.isResp] }
  get result (): DfuResCode {
    if (this.isResp === 0) return DfuResCode.SUCCESS
    return this.buf[2] === DfuResCode.EXT_ERROR ? this.buf.readUInt16BE(2) : this.buf[2]
  }

  get errMsg (): string | undefined {
    const result = this.result
    if (result === DfuResCode.SUCCESS) return
    return DfuErrMsg.get(result) ?? `Unknown DfuResCode: ${result}`
  }
}

/**
 * @see [MIFARE type identification procedure](https://www.nxp.com/docs/en/application-note/AN10833.pdf)
 */
const NxpTypeBySak = new Map([
  [0x00, 'MIFARE Ultralight Classic/C/EV1/Nano | NTAG 2xx'],
  [0x08, 'MIFARE Classic 1K | Plus SE 1K | Plug S 2K | Plus X 2K'],
  [0x09, 'MIFARE Mini 0.3k'],
  [0x10, 'MIFARE Plus 2K'],
  [0x11, 'MIFARE Plus 4K'],
  [0x18, 'MIFARE Classic 4K | Plus S 4K | Plus X 4K'],
  [0x19, 'MIFARE Classic 2K'],
  [0x20, 'MIFARE Plus EV1/EV2 | DESFire EV1/EV2/EV3 | DESFire Light | NTAG 4xx | MIFARE Plus S 2/4K | MIFARE Plus X 2/4K | MIFARE Plus SE 1K'],
  [0x28, 'SmartMX with MIFARE Classic 1K'],
  [0x38, 'SmartMX with MIFARE Classic 4K'],
])

function bufLrc (buf: Buffer): number {
  let sum = 0
  for (const u8 of buf) sum += u8
  return 0x100 - sum & 0xFF
}

function bufIsLenOrFail (buf: Buffer, len: number, name: string): void {
  if (Buffer.isBuffer(buf) && buf.length === len) return
  throw new TypeError(`${name} must be a ${len} ${['byte', 'bytes'][+(len > 1)]} Buffer.`)
}

function mfuCheckRespNakCrc16a (resp: Buffer): Buffer {
  const createErr = (status: RespStatus, msg: string): Error => _.merge(new Error(msg), { status, data: { resp } })
  if (resp.length === 1 && resp[0] !== 0x0A) throw createErr(RespStatus.HF_ERR_STAT, `received NAK 0x${resp.toString('hex')}`)
  if (resp.length < 3) throw createErr(RespStatus.HF_ERR_CRC, 'unexpected resp')
  const data = resp.subarray(0, -2)
  if (crc16a(data) !== resp.readUInt16LE(data.length)) throw createErr(RespStatus.HF_ERR_CRC, 'invalid crc16a of resp')
  return data
}

export { Decoder as ResponseDecoder }
