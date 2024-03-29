import _ from 'lodash'
import { Buffer } from './buffer'
import { debug as createDebugger, type Debugger } from 'debug'
import { errToJson, middlewareCompose, sleep, type MiddlewareComposeFn, versionCompare } from './helper'
import { type ReadableStream, type UnderlyingSink, WritableStream } from 'node:stream/web'
import * as Decoder from './ResponseDecoder'

import {
  Cmd,
  DeviceMode,
  Mf1KeyType,
  RespStatus,
  type AnimationMode,
  type ButtonAction,
  type ButtonType,
  type DeviceModel,
  type FreqType,
  type Mf1EmuWriteMode,
  type Mf1PrngType,
  type Mf1VblockOperator,
  type Slot,
  type TagType,

  isAnimationMode,
  isButtonAction,
  isButtonType,
  isDeviceMode,
  isMf1EmuWriteMode,
  isMf1KeyType,
  isMf1VblockOperator,
  isSlot,
  isTagType,
  isValidFreqType,
} from './enums'

const READ_DEFAULT_TIMEOUT = 5e3
const START_OF_FRAME = new Buffer(2).writeUInt16BE(0x11EF)
const VERSION_SUPPORTED = { gte: '2.0', lt: '3.0' } as const

function isMf1BlockNo (block: any): boolean {
  return _.isInteger(block) && block >= 0 && block <= 0xFF
}

function validateMf1BlockKey (block: any, keyType: any, key: any, prefix: string = ''): void {
  if (!isMf1BlockNo(block)) throw new TypeError(`${prefix}block should be a integer`)
  if (!isMf1KeyType(keyType)) throw new TypeError(`${prefix}keyType should be a Mf1KeyType`)
  if (!Buffer.isBuffer(key) || key.length !== 6) throw new TypeError(`${prefix}key should be a Buffer(6)`)
}

/**
 * The core library of "chameleon-ultra.js". The instance of this class must use exactly one adapter plugin to communication to ChameleonUltra.
 */
export class ChameleonUltra {
  /**
   * @internal
   * @group Internal
   */
  debug: boolean

  /**
   * @internal
   * @group Internal
   */
  hooks: Record<string, MiddlewareComposeFn[]>

  /**
   * @internal
   * @group Internal
   */
  isDisconnecting: boolean = false

  /**
   * @internal
   * @group Internal
   */
  logger: Record<string, Logger> = {}

  /**
   * @internal
   * @group Internal
   */
  plugins: Map<string, ChameleonPlugin>

  /**
   * @internal
   * @group Internal
   */
  port?: ChameleonSerialPort<Buffer, Buffer>

  /**
   * @internal
   * @group Internal
   */
  rxSink?: ChameleonRxSink

  /**
   * @internal
   * @group Internal
   */
  supportedCmds: Set<Cmd> = new Set<Cmd>()

  /**
   * @internal
   * @group Internal
   */
  deviceMode: DeviceMode | null = null

  /**
   * The supported version of SDK.
   * @group Device Related
   */
  static VERSION_SUPPORTED = VERSION_SUPPORTED

  /**
   * Create a new instance of ChameleonUltra.
   * @param debug Enable debug mode.
   * @example
   * Example usage in Browser (place at the end of body):
   *
   * ```html
   * <script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/iife/index.min.js"></script>
   * <script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/iife/plugin/WebbleAdapter.min.js"></script>
   * <script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/iife/plugin/WebserialAdapter.min.js"></script>
   * <script>
   *   const { ChameleonUltra, WebbleAdapter, WebserialAdapter } = ChameleonUltraJS
   *
   *   const ultraUsb = new ChameleonUltra()
   *   ultraUsb.use(new WebserialAdapter())
   *
   *   const ultraBle = new ChameleonUltra()
   *   ultraBle.use(new WebbleAdapter())
   * </script>
   * ```
   *
   * Example usage in CommonJS:
   *
   * ```js
   * const { ChameleonUltra } = require('chameleon-ultra.js')
   * const WebbleAdapter = require('chameleon-ultra.js/plugin/WebbleAdapter')
   * const WebserialAdapter = require('chameleon-ultra.js/plugin/WebserialAdapter')
   * const SerialPortAdapter = require('chameleon-ultra.js/plugin/SerialPortAdapter')
   *
   * const ultraUsb = new ChameleonUltra()
   * ultraUsb.use(new WebserialAdapter())
   *
   * const ultraBle = new ChameleonUltra()
   * ultraBle.use(new WebbleAdapter())
   *
   * const ultraNode = new ChameleonUltra()
   * ultraNode.use(new SerialPortAdapter())
   * ```
   *
   * Example usage in ESM:
   *
   * ```js
   * import { ChameleonUltra } from 'chameleon-ultra.js'
   * import WebbleAdapter from 'chameleon-ultra.js/plugin/WebbleAdapter'
   * import WebserialAdapter from 'chameleon-ultra.js/plugin/WebserialAdapter'
   * import SerialPortAdapter from 'chameleon-ultra.js/plugin/SerialPortAdapter'
   *
   * const ultraUsb = new ChameleonUltra()
   * ultraUsb.use(new WebserialAdapter())
   *
   * const ultraBle = new ChameleonUltra()
   * ultraBle.use(new WebbleAdapter())
   *
   * const ultraNode = new ChameleonUltra()
   * ultraNode.use(new SerialPortAdapter())
   * ```
   */
  constructor (debug = false) {
    this.hooks = {}
    this.plugins = new Map()
    this.debug = debug
    _.extend(this.logger, {
      core: this.createDebugger('core'),
      resp: this.createDebugger('resp'),
      respError: this.createDebugger('respError'),
      send: this.createDebugger('send'),
    })
  }

  /**
   * @internal
   * @group Plugin Related
   */
  createDebugger (name: string): Logger {
    if (!this.debug) return (...args: any[]) => {}
    return createDebugger(`ultra:${name}`)
  }

  /**
   * Register a plugin.
   * @param plugin The plugin to register.
   * @param option The option to pass to plugin.install().
   * @group Plugin Related
   */
  async use (plugin: ChameleonPlugin, option?: any): Promise<this> {
    const pluginId = `$${plugin.name}`
    const installResp = await plugin.install({ Buffer, ultra: this }, option)
    if (!_.isNil(installResp)) (this as Record<string, any>)[pluginId] = installResp
    return this
  }

  /**
   * Register a hook.
   * @param hook The hook name.
   * @param fn The function to register.
   * @group Plugin Related
   */
  addHook (hook: string, fn: MiddlewareComposeFn): this {
    if (!_.isArray(this.hooks[hook])) this.hooks[hook] = []
    this.hooks[hook].push(fn)
    return this
  }

  /**
   * Invoke a hook with context.
   * @param hook The hook name.
   * @param ctx The context will be passed to every middleware.
   * @param next The next middleware function.
   * @returns The return value depent on the middlewares
   * @group Plugin Related
   */
  async invokeHook (hook: string, ctx: any = {}, next?: MiddlewareComposeFn): Promise<unknown> {
    ctx.me = this
    return await middlewareCompose(this.hooks[hook] ?? [])(ctx, next)
  }

  /**
   * Connect to ChameleonUltra. This method will be called automatically when you call any command.
   * @group Connection Related
   */
  async connect (): Promise<void> {
    await this.invokeHook('connect', {}, async (ctx, next) => {
      try {
        if (_.isNil(this.port)) throw new Error('this.port is undefined. Did you remember to use adapter plugin?')

        // serial.readable pipeTo this.rxSink
        this.rxSink = new ChameleonRxSink()
        void this.port.readable.pipeTo(new WritableStream(this.rxSink), {
          signal: this.rxSink.signal,
        }).catch(async err => {
          if (err.message === 'disconnect()') return // disconnected by invoke disconnect()
          await this.disconnect(_.merge(new Error(`Failed to read resp: ${err.message}`), { originalError: err }))
        })

        this.logger.core('chameleon connected')
      } catch (err) {
        this.logger.core(`Failed to connect: ${err.message as string}`)
        if (this.isConnected()) await this.disconnect(err)
        throw _.merge(new Error(err.message ?? 'Failed to connect'), { originalError: err })
      }
    })
  }

  /**
   * Disconnect ChameleonUltra.
   * @group Connection Related
   */
  async disconnect (err: Error = new Error('disconnect()')): Promise<void> {
    try {
      if (this.isDisconnecting) return
      this.logger.core('%s %O', err.message, errToJson(err))
      this.isDisconnecting = true // 避免重複執行
      await this.invokeHook('disconnect', { err }, async (ctx, next) => {
        try {
          // clean up
          this.deviceMode = null
          this.supportedCmds.clear()

          // close port
          this.rxSink?.controller.abort(err)
          while (this.port?.readable?.locked === true) await sleep(10)
          await this.port?.readable?.cancel(err)
          await this.port?.writable?.close()
          delete this.port
        } catch (err) {
          throw _.merge(new Error(err.message ?? 'Failed to disconnect'), { originalError: err })
        }
      })
    } finally {
      this.isDisconnecting = false
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
   * Calculate the LRC byte of a buffer.
   * @internal
   * @group Internal
   */
  _calcLrc (buf: Buffer): number {
    return 0x100 - _.sum(buf) & 0xFF
  }

  /**
   * Send a buffer to device.
   * @param buf The buffer to be sent to device.
   * @internal
   * @group Internal
   */
  async _writeBuffer (buf: Buffer): Promise<void> {
    await this.invokeHook('_writeBuffer', { buf }, async (ctx, next) => {
      try {
        if (!Buffer.isBuffer(ctx.buf)) throw new TypeError('buf should be a Buffer')
        if (!this.isConnected()) await this.connect()
        this.logger.send(ChameleonUltraFrame.inspect(ctx.buf))
        const writer = (this.port?.writable as any)?.getWriter()
        if (_.isNil(writer)) throw new Error('Failed to getWriter(). Did you remember to use adapter plugin?')
        await writer.write(ctx.buf)
        writer.releaseLock()
      } catch (err) {
        throw _.merge(new Error(err.message ?? 'Failed to connect'), { originalError: err })
      }
    })
  }

  /**
   * Send a command to device.
   * @param opts.cmd The command to be sent to device.
   * @param opts.status The status is always `0x0000`.
   * @param opts.data `<= 512 bytes`, the data to be sent. This payload depends on the exact command being used. See [Packet payloads](https://github.com/RfidResearchGroup/ChameleonUltra/blob/main/docs/protocol.md#packet-payloads) for more infomation.
   * @internal
   * @group Internal
   */
  async _writeCmd (opts: {
    cmd: Cmd
    status?: RespStatus
    data?: Buffer
  }): Promise<void> {
    const { cmd, status = 0, data = Buffer.allocUnsafe(0) } = opts
    const buf = Buffer.allocUnsafe(data.length + 10)
    START_OF_FRAME.copy(buf, 0) // SOF + SOF LRC Byte
    // head info
    buf.writeUInt16BE(cmd, 2)
    buf.writeUInt16BE(status, 4)
    buf.writeUInt16BE(data.length, 6)
    buf[8] = this._calcLrc(buf.subarray(2, 8)) // head lrc byte
    // data
    if (data.length > 0) data.copy(buf, 9)
    // lrc byte of buf
    buf[buf.length - 1] = this._calcLrc(buf.subarray(9, -1))
    await this._writeBuffer(buf)
  }

  /**
   * Return the buffers in rxSink and clear rxSink.
   * @returns The buffers in rxSink.
   * @internal
   * @group Internal
   */
  _clearRxBufs (): Buffer[] {
    return this.rxSink?.bufs.splice(0, this.rxSink.bufs.length) ?? []
  }

  /**
   * Read a response from device.
   * @param timeout The timeout in milliseconds.
   * @internal
   * @group Internal
   */
  async _readRespTimeout ({ cmd, timeout }: { cmd?: Cmd, timeout?: number } = {}): Promise<ChameleonUltraFrame> {
    interface Context {
      startedAt?: number
      nowts?: number
      timeout?: number
      resp?: ChameleonUltraFrame
    }
    return await this.invokeHook('_readRespTimeout', { timeout }, async (ctx: Context, next) => {
      if (!this.isConnected()) await this.connect()
      if (_.isNil(this.rxSink)) throw new Error('rxSink is undefined')
      ctx.timeout = ctx.timeout ?? READ_DEFAULT_TIMEOUT
      ctx.startedAt = Date.now()
      while (true) {
        if (!this.isConnected()) throw new Error('device disconnected')
        ctx.nowts = Date.now()
        if (ctx.nowts > ctx.startedAt + ctx.timeout) throw new Error(`readRespTimeout ${ctx.timeout}ms`)
        let buf = Buffer.concat(this._clearRxBufs())
        try {
          const sofIdx = buf.indexOf(START_OF_FRAME)
          if (sofIdx < 0) throw new Error('SOF not found')
          else if (sofIdx > 0) throw _.merge(new Error('ignore bytes before SOF'), { skip: sofIdx })
          // sof + sof lrc + cmd (2) + status (2) + data len (2) + head lrc + data + data lrc
          if (buf.length < 10) throw new Error('buf.length < 10')
          if (this._calcLrc(buf.subarray(2, 8)) !== buf[8]) throw _.merge(new Error('head lrc mismatch'), { skip: 1 })
          const lenFrame = buf.readUInt16BE(6) + 10
          if (buf.length < lenFrame) throw new Error('waiting for more data')
          if (this._calcLrc(buf.subarray(9, -1)) !== buf[buf.length - 1]) throw _.merge(new Error('data lrc mismatch'), { skip: 1 })
          ctx.resp = new ChameleonUltraFrame(buf.subarray(0, lenFrame))
          if (!_.isNil(cmd) && ctx.resp.cmd !== cmd) throw _.merge(new Error(`expect cmd=${cmd} but receive cmd=${ctx.resp.cmd}`), { skip: lenFrame })
          // resp is valid
          if (buf.length > lenFrame) this.rxSink.bufs.unshift(buf.subarray(lenFrame))
          break
        } catch (err) {
          const skip = err.skip ?? 0
          if (skip > 0) {
            this.logger.respError(`readRespTimeout skip ${skip} byte(s), reason = ${err.message}`)
            buf = buf.subarray(skip)
          }
          this.rxSink.bufs.unshift(buf)
        }
        await sleep(10)
      }
      if (RespStatusFail.has(ctx.resp.status)) {
        const status = ctx.resp.status
        this.logger.respError(ctx.resp.inspect)
        throw _.merge(new Error(RespStatusMsg.get(status)), { status, data: { resp: ctx.resp } })
      }
      this.logger.resp(ctx.resp.inspect)
      return ctx.resp
    }) as ChameleonUltraFrame
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
    this._clearRxBufs()
    const cmd = Cmd.GET_APP_VERSION // cmd = 1000
    await this._writeCmd({ cmd })
    const { status, data } = await this._readRespTimeout({ cmd })
    if (status === RespStatus.HF_TAG_OK && data.readUInt16BE(0) === 0x0001) throw new Error('Unsupported protocol. Firmware update is required.')
    return `${data[0]}.${data[1]}`
  }

  /**
   * Change device mode to tag reader or tag emulator.
   * @param mode The mode to be changed.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { DeviceMode } = window.ChameleonUltraJS
   *   await ultra.cmdChangeDeviceMode(DeviceMode.TAG)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdChangeDeviceMode (mode: DeviceMode): Promise<void> {
    if (!isDeviceMode(mode)) throw new TypeError('Invalid device mode')
    this._clearRxBufs()
    const cmd = Cmd.CHANGE_DEVICE_MODE // cmd = 1001
    await this._writeCmd({ cmd, data: Buffer.pack('!B', mode) })
    await this._readRespTimeout({ cmd })
    this.deviceMode = mode
  }

  /**
   * Get current mode of device.
   * @returns Current mode of device.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { DeviceMode } = window.ChameleonUltraJS
   *   const deviceMode = await ultra.cmdGetDeviceMode()
   *   console.log(DeviceMode[deviceMode]) // 'TAG'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetDeviceMode (): Promise<DeviceMode> {
    this._clearRxBufs()
    const cmd = Cmd.GET_DEVICE_MODE // cmd = 1002
    await this._writeCmd({ cmd })
    const data = (await this._readRespTimeout({ cmd }))?.data
    this.deviceMode = data[0]
    return this.deviceMode
  }

  /**
   * Automatically change the device mode to `mode` if the current device mode is not equal to `mode`.
   * @group Device Related
   */
  async assureDeviceMode (mode: DeviceMode): Promise<void> {
    if (this.deviceMode === mode) return
    await this.cmdChangeDeviceMode(mode)
  }

  /**
   * Change the active emulation tag slot of device.
   * @param slot The slot to be active.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot } = window.ChameleonUltraJS
   *   await ultra.cmdSlotSetActive(Slot.SLOT_1)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotSetActive (slot: Slot): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    this._clearRxBufs()
    const cmd = Cmd.SET_ACTIVE_SLOT // cmd = 1003
    await this._writeCmd({ cmd, data: Buffer.pack('!B', slot) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Change the emulation tag type of specified slot.
   * @param slot The slot to be set.
   * @param tagType The tag type to be set.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, TagType } = window.ChameleonUltraJS
   *   await ultra.cmdSlotChangeTagType(Slot.SLOT_1, TagType.MIFARE_1024)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotChangeTagType (slot: Slot, tagType: TagType): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isTagType(tagType)) throw new TypeError('Invalid tagType')
    this._clearRxBufs()
    const cmd = Cmd.SET_SLOT_TAG_TYPE // cmd = 1004
    await this._writeCmd({ cmd, data: Buffer.pack('!BH', slot, tagType) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Reset the emulation tag data of specified tag type in specified slot to default values.
   * @param slot The slot to be reset.
   * @param tagType The tag type to be reset.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, TagType } = window.ChameleonUltraJS
   *   await ultra.cmdSlotResetTagType(Slot.SLOT_1, TagType.MIFARE_1024)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotResetTagType (slot: Slot, tagType: TagType): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isTagType(tagType)) throw new TypeError('Invalid tagType')
    this._clearRxBufs()
    const cmd = Cmd.SET_SLOT_DATA_DEFAULT // cmd = 1005
    await this._writeCmd({ cmd, data: Buffer.pack('!BH', slot, tagType) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Enable or disable the specified slot.
   * @param slot The slot to be enable/disable.
   * @param enable `true` to enable the slot, `false` to disable the slot.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { FreqType, Slot } = window.ChameleonUltraJS
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
    this._clearRxBufs()
    const cmd = Cmd.SET_SLOT_ENABLE // cmd = 1006
    await this._writeCmd({ cmd, data: Buffer.pack('!BB?', slot, freq, enable) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Set the nickname of specified freq type in specified slot.
   * @param slot The slot to be set.
   * @param freq The freq type to be set.
   * @param name The name to be set. The `byteLength` of name should between `1` and `32`.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, FreqType } = window.ChameleonUltraJS
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
    this._clearRxBufs()
    const cmd = Cmd.SET_SLOT_TAG_NICK // cmd = 1007
    await this._writeCmd({ cmd, data: Buffer.pack(`!BB${buf1.length}s`, slot, freq, buf1) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Get the nickname of specified freq type in specified slot.
   * @param slot The slot to be get.
   * @param freq The freq type to be get.
   * @returns The nickname of specified freq type in specified slot.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, FreqType } = window.ChameleonUltraJS
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
      this._clearRxBufs()
      const cmd = Cmd.GET_SLOT_TAG_NICK // cmd = 1008
      await this._writeCmd({ cmd, data: Buffer.pack('!BB', slot, freq) })
      return (await this._readRespTimeout({ cmd }))?.data.toString('utf8')
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
   *   const { Buffer } = window.ChameleonUltraJS
   *   await ultra.cmdMf1EmuWriteBlock(1, Buffer.alloc(16))
   *   await ultra.cmdSlotSaveSettings()
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotSaveSettings (): Promise<void> {
    this._clearRxBufs()
    const cmd = Cmd.SLOT_DATA_CONFIG_SAVE // cmd = 1009
    await this._writeCmd({ cmd })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Enter bootloader mode.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdEnterBootloader()
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdEnterBootloader (): Promise<void> {
    this._clearRxBufs()
    const cmd = Cmd.ENTER_BOOTLOADER // cmd = 1010
    await this._writeCmd({ cmd })
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
    this._clearRxBufs()
    const cmd = Cmd.GET_DEVICE_CHIP_ID // cmd = 1011
    await this._writeCmd({ cmd })
    const data = (await this._readRespTimeout({ cmd }))?.data
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
    this._clearRxBufs()
    const cmd = Cmd.GET_DEVICE_ADDRESS // cmd = 1012
    await this._writeCmd({ cmd })
    const data = (await this._readRespTimeout({ cmd }))?.data
    const arr = []
    for (let i = 0; i < data.length; i++) arr.push(data.subarray(i, i + 1).toString('hex'))
    return _.toUpper(arr.join(':'))
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
    this._clearRxBufs()
    const cmd = Cmd.SAVE_SETTINGS // cmd = 1013
    await this._writeCmd({ cmd })
    await this._readRespTimeout({ cmd })
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
    this._clearRxBufs()
    const cmd = Cmd.RESET_SETTINGS // cmd = 1014
    await this._writeCmd({ cmd })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Set the animation mode of device while wake-up and sleep.
   * @param mode The animation mode to be set.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { AnimationMode } = window.ChameleonUltraJS
   *   await ultra.cmdSetAnimationMode(AnimationMode.SHORT)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSetAnimationMode (mode: AnimationMode): Promise<void> {
    if (!isAnimationMode(mode)) throw new TypeError('Invalid mode')
    this._clearRxBufs()
    const cmd = Cmd.SET_ANIMATION_MODE // cmd = 1015
    await this._writeCmd({ cmd, data: Buffer.pack('!B', mode) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Get the animation mode of device while wake-up and sleep.
   * @returns The animation mode of device.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { AnimationMode } = window.ChameleonUltraJS
   *   const mode = await ultra.cmdGetAnimationMode()
   *   console.log(AnimationMode[mode]) // 'FULL'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetAnimationMode (): Promise<AnimationMode> {
    this._clearRxBufs()
    const cmd = Cmd.GET_ANIMATION_MODE // cmd = 1016
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data[0]
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
    this._clearRxBufs()
    const cmd = Cmd.GET_GIT_VERSION // cmd = 1017
    await this._writeCmd({ cmd })
    const data = (await this._readRespTimeout({ cmd }))?.data
    return data.toString('utf8')
  }

  /**
   * Get the active emulation tag slot of device.
   * @returns The active slot of device.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot } = window.ChameleonUltraJS
   *   const slot = await ultra.cmdSlotGetActive()
   *   console.log(Slot[slot]) // 'SLOT_1'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotGetActive (): Promise<Slot> {
    this._clearRxBufs()
    const cmd = Cmd.GET_ACTIVE_SLOT // cmd = 1018
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data[0]
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
  async cmdSlotGetInfo (): Promise<Decoder.SlotInfo[]> {
    this._clearRxBufs()
    const cmd = Cmd.GET_SLOT_INFO // cmd = 1019
    await this._writeCmd({ cmd })
    return Decoder.SlotInfo.fromCmd1019((await this._readRespTimeout({ cmd }))?.data)
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
    this._clearRxBufs()
    const cmd = Cmd.WIPE_FDS // cmd = 1020
    await this._writeCmd({ cmd })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Delete the nick name of the slot
   * @param slot Slot number
   * @param freq Frequency type
   * @returns `true` if success, `false` if slot name is empty.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, FreqType } = window.ChameleonUltraJS
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
      this._clearRxBufs()
      const cmd = Cmd.DELETE_SLOT_TAG_NICK // cmd = 1021
      await this._writeCmd({ cmd, data: Buffer.pack('!BB', slot, freq) })
      await this._readRespTimeout({ cmd })
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
  async cmdSlotGetIsEnable (): Promise<Decoder.SlotFreqIsEnable[]> {
    this._clearRxBufs()
    const cmd = Cmd.GET_ENABLED_SLOTS // cmd = 1023
    await this._writeCmd({ cmd })
    return Decoder.SlotFreqIsEnable.fromCmd1023((await this._readRespTimeout({ cmd }))?.data)
  }

  /**
   * Delete the emulation tag data of specified freq type in specified slot.
   * @param slot The slot to be deleted.
   * @param freq The freq type of slot.
   * @group Slot Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Slot, FreqType } = window.ChameleonUltraJS
   *   await ultra.cmdSlotDeleteFreqType(Slot.SLOT_1, FreqType.HF)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSlotDeleteFreqType (slot: Slot, freq: FreqType): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isValidFreqType(freq)) throw new TypeError('Invalid freq')
    this._clearRxBufs()
    const cmd = Cmd.DELETE_SLOT_SENSE_TYPE // cmd = 1024
    await this._writeCmd({ cmd, data: Buffer.pack('!BB', slot, freq) })
    await this._readRespTimeout({ cmd })
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
  async cmdGetBatteryInfo (): Promise<Decoder.BatteryInfo> {
    this._clearRxBufs()
    const cmd = Cmd.GET_BATTERY_INFO // cmd = 1025
    await this._writeCmd({ cmd })
    return Decoder.BatteryInfo.fromCmd1025((await this._readRespTimeout({ cmd }))?.data)
  }

  /**
   * Get the button press action of specified button.
   * @param btn The button to be get.
   * @returns The button press action of specified button.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { ButtonAction, ButtonType } = window.ChameleonUltraJS
   *   const btnAction = await ultra.cmdGetButtonPressAction(ButtonType.BUTTON_A)
   *   console.log(ButtonAction[btnAction]) // 'CYCLE_SLOT_INC'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetButtonPressAction (btn: ButtonType): Promise<ButtonAction> {
    if (!isButtonType(btn)) throw new TypeError('Invalid btn')
    this._clearRxBufs()
    const cmd = Cmd.GET_BUTTON_PRESS_CONFIG // cmd = 1026
    await this._writeCmd({ cmd, data: Buffer.pack('!B', btn) })
    return (await this._readRespTimeout({ cmd }))?.data[0]
  }

  /**
   * Set the button press action of specified button.
   * @param btn The button to be set.
   * @param action The button press action to be set.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { ButtonAction, ButtonType } = window.ChameleonUltraJS
   *   await ultra.cmdSetButtonPressAction(ButtonType.BUTTON_A, ButtonAction.CYCLE_SLOT_INC)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSetButtonPressAction (btn: ButtonType, action: ButtonAction): Promise<void> {
    if (!isButtonType(btn)) throw new TypeError('Invalid btn')
    if (!isButtonAction(action)) throw new TypeError('Invalid action')
    this._clearRxBufs()
    const cmd = Cmd.SET_BUTTON_PRESS_CONFIG // cmd = 1027
    await this._writeCmd({ cmd, data: Buffer.pack('!BB', btn, action) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Get the button long press action of specified button.
   * @param btn The button to be get.
   * @returns The button long press action of specified button.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { ButtonAction, ButtonType } = window.ChameleonUltraJS
   *   const btnAction = await ultra.cmdGetButtonLongPressAction(ButtonType.BUTTON_A)
   *   console.log(ButtonAction[btnAction]) // 'CLONE_IC_UID'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetButtonLongPressAction (btn: ButtonType): Promise<ButtonAction> {
    if (!isButtonType(btn)) throw new TypeError('Invalid btn')
    this._clearRxBufs()
    const cmd = Cmd.GET_LONG_BUTTON_PRESS_CONFIG // cmd = 1028
    await this._writeCmd({ cmd, data: Buffer.pack('!B', btn) })
    return (await this._readRespTimeout({ cmd }))?.data[0]
  }

  /**
   * Set the button long press action of specified button.
   * @param btn The button to be set.
   * @param action The button long press action to be set.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { ButtonAction, ButtonType } = window.ChameleonUltraJS
   *   await ultra.cmdSetButtonLongPressAction(ButtonType.BUTTON_A, ButtonAction.CYCLE_SLOT_INC)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdSetButtonLongPressAction (btn: ButtonType, action: ButtonAction): Promise<void> {
    if (!isButtonType(btn)) throw new TypeError('Invalid btn')
    if (!isButtonAction(action)) throw new TypeError('Invalid action')
    this._clearRxBufs()
    const cmd = Cmd.SET_LONG_BUTTON_PRESS_CONFIG // cmd = 1029
    await this._writeCmd({ cmd, data: Buffer.pack('!BB', btn, action) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Set the ble pairing key of device.
   * @param key The new ble pairing key.
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
    this._clearRxBufs()
    const cmd = Cmd.SET_BLE_PAIRING_KEY // cmd = 1030
    await this._writeCmd({ cmd, data: Buffer.from(key) })
    await this._readRespTimeout({ cmd })
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
    this._clearRxBufs()
    const cmd = Cmd.GET_BLE_PAIRING_KEY // cmd = 1031
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data.toString('utf8')
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
    this._clearRxBufs()
    const cmd = Cmd.DELETE_ALL_BLE_BONDS // cmd = 1032
    await this._writeCmd({ cmd })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Get the device is ChameleonUltra or ChameleonLite.
   * @returns `true` if device is ChameleonUltra, `false` if device is ChameleonLite.
   * @group Device Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { DeviceModel } = window.ChameleonUltraJS
   *   const model = await ultra.cmdGetDeviceModel()
   *   console.log(DeviceModel[model]) // 'ULTRA'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdGetDeviceModel (): Promise<DeviceModel> {
    this._clearRxBufs()
    const cmd = Cmd.GET_DEVICE_MODEL // cmd = 1033
    await this._writeCmd({ cmd })
    const data = (await this._readRespTimeout({ cmd }))?.data
    return data[0]
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
  async cmdGetDeviceSettings (): Promise<Decoder.DeviceSettings> {
    this._clearRxBufs()
    const cmd = Cmd.GET_DEVICE_SETTINGS // cmd = 1034
    await this._writeCmd({ cmd })
    return Decoder.DeviceSettings.fromCmd1034((await this._readRespTimeout({ cmd }))?.data)
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
    this._clearRxBufs()
    const cmd = Cmd.GET_DEVICE_CAPABILITIES // cmd = 1035
    await this._writeCmd({ cmd })
    const data = (await this._readRespTimeout({ cmd }))?.data
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
   *   console.log(await ultra.isCmdSupported(Cmd.GET_APP_VERSION)) // true
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async isCmdSupported (cmd: Cmd): Promise<boolean> {
    if (this.supportedCmds.size === 0) this.supportedCmds = await this.cmdGetSupportedCmds()
    return this.supportedCmds.has(cmd)
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
    this._clearRxBufs()
    const cmd = Cmd.GET_BLE_PAIRING_ENABLE // cmd = 1036
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data[0] === 1
  }

  /**
   * Set if the ble pairing is required when connecting to device.
   * @param enable `true` to enable pairing mode, `false` to disable pairing mode.
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
    this._clearRxBufs()
    const cmd = Cmd.SET_BLE_PAIRING_ENABLE // cmd = 1037
    await this._writeCmd({ cmd, data: Buffer.pack('!?', enable) })
    await this._readRespTimeout({ cmd })
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
  async cmdHf14aScan (): Promise<Decoder.Hf14aAntiColl[]> {
    await this.assureDeviceMode(DeviceMode.READER)
    this._clearRxBufs()
    const cmd = Cmd.HF14A_SCAN // cmd = 2000
    await this._writeCmd({ cmd })
    return Decoder.Hf14aAntiColl.fromCmd2000((await this._readRespTimeout({ cmd }))?.data)
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
      this._clearRxBufs()
      const cmd = Cmd.MF1_DETECT_SUPPORT // cmd = 2001
      await this._writeCmd({ cmd })
      await this._readRespTimeout({ cmd })
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
   *   const { Mf1PrngType } = window.ChameleonUltraJS
   *   console.log(Mf1PrngType[await ultra.cmdMf1TestPrngType()]) // 'WEAK'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1TestPrngType (): Promise<Mf1PrngType> {
    await this.assureDeviceMode(DeviceMode.READER)
    this._clearRxBufs()
    const cmd = Cmd.MF1_DETECT_NT_LEVEL // cmd = 2002
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data[0]
  }

  /**
   * Use a known key to do the mifare static nested attack.
   * @param known The info of known key.
   * @param known.block The block of known key.
   * @param known.key The known key.
   * @param known.keyType The key type of known key.
   * @param target The info of target key to be attack.
   * @param target.block The block of target key.
   * @param target.keyType The key type of target key.
   * @returns The result of mifare static nested attack.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = window.ChameleonUltraJS
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
  ): Promise<Decoder.Mf1AcquireStaticNestedRes> {
    validateMf1BlockKey(known.block, known.keyType, known.key, 'known.')
    if (!isMf1BlockNo(target.block)) throw new TypeError('Invalid target.block')
    if (!isMf1KeyType(target.keyType)) throw new TypeError('Invalid target.keyType')
    await this.assureDeviceMode(DeviceMode.READER)
    this._clearRxBufs()
    const cmd = Cmd.MF1_STATIC_NESTED_ACQUIRE // cmd = 2003
    await this._writeCmd({ cmd, data: Buffer.pack('!BB6sBB', known.keyType, known.block, known.key, target.keyType, target.block) })
    return Decoder.Mf1AcquireStaticNestedRes.fromCmd2003((await this._readRespTimeout({ cmd }))?.data)
  }

  /**
   * Acquire the data from mifare darkside attack.
   * @param block The target block.
   * @param keyType The target key type.
   * @param isFirst `true` if this is the first attack.
   * @param syncMax The max sync count of darkside attack.
   * @returns The data from mifare darkside attack.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Mf1KeyType, DarksideStatus } = window.ChameleonUltraJS
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
   *   const { Buffer, DarksideStatus, Mf1KeyType } = window.ChameleonUltraJS
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
  ): Promise<Decoder.Mf1DarksideRes> {
    if (!_.isSafeInteger(block)) throw new TypeError('Invalid block')
    if (!isMf1KeyType(keyType)) throw new TypeError('Invalid keyType')
    if (_.isNil(isFirst)) throw new TypeError('Invalid isFirst')
    if (!_.isSafeInteger(syncMax)) throw new TypeError('Invalid syncMax')
    await this.assureDeviceMode(DeviceMode.READER)
    this._clearRxBufs()
    const cmd = Cmd.MF1_DARKSIDE_ACQUIRE // cmd = 2004
    await this._writeCmd({ cmd, data: Buffer.pack('!BB?B', keyType, block, isFirst, syncMax) })
    return Decoder.Mf1DarksideRes.fromCmd2004((await this._readRespTimeout({ cmd, timeout: syncMax * 1e4 }))?.data)
  }

  /**
   * Dectect the nt distance of mifare protocol.
   * @param known The info of known key.
   * @param known.block The block of known key.
   * @param known.key The known key.
   * @param known.keyType The key type of known key.
   * @returns The nt distance of mifare protocol.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = window.ChameleonUltraJS
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
  async cmdMf1TestNtDistance (known: { block: number, key: Buffer, keyType: Mf1KeyType }): Promise<Decoder.Mf1NtDistanceRes> {
    validateMf1BlockKey(known.block, known.keyType, known.key, 'known.')
    await this.assureDeviceMode(DeviceMode.READER)
    this._clearRxBufs()
    const cmd = Cmd.MF1_DETECT_NT_DIST // cmd = 2005
    await this._writeCmd({ cmd, data: Buffer.pack('!BB6s', known.keyType, known.block, known.key) })
    return Decoder.Mf1NtDistanceRes.fromCmd2005((await this._readRespTimeout({ cmd }))?.data)
  }

  /**
   * Use a known key to do the mifare nested attack.
   * @param known The info of known key.
   * @param known.block The block of known key.
   * @param known.key The known key.
   * @param known.keyType The key type of known key.
   * @param target The info of target key to be attack.
   * @param target.block The block of target key.
   * @param target.keyType The key type of target key.
   * @returns The result of mifare nested attack.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = window.ChameleonUltraJS
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
  ): Promise<Decoder.Mf1NestedRes[]> {
    validateMf1BlockKey(known.block, known.keyType, known.key, 'known.')
    if (!_.isSafeInteger(target.block)) throw new TypeError('Invalid target.block')
    if (!isMf1KeyType(target.keyType)) throw new TypeError('Invalid target.keyType')
    await this.assureDeviceMode(DeviceMode.READER)
    this._clearRxBufs()
    const cmd = Cmd.MF1_NESTED_ACQUIRE // cmd = 2006
    await this._writeCmd({ cmd, data: Buffer.pack('!BB6sBB', known.keyType, known.block, known.key, target.keyType, target.block) })
    return Decoder.Mf1NestedRes.fromCmd2006((await this._readRespTimeout({ cmd }))?.data)
  }

  /**
   * Check if the key is valid for specified block and key type.
   * @param opts The info of key to be checked.
   * @param opts.block The block of key to be checked.
   * @param opts.keyType The type of key to be checked.
   * @param opts.key The key to be checked.
   * @returns `true` if the key is valid for specified block and key type.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = window.ChameleonUltraJS
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
      this._clearRxBufs()
      const cmd = Cmd.MF1_AUTH_ONE_KEY_BLOCK // cmd = 2007
      await this._writeCmd({ cmd, data: Buffer.pack('!BB6s', keyType, block, key) })
      await this._readRespTimeout({ cmd })
      return true
    } catch (err) {
      if (err.status === RespStatus.MF_ERR_AUTH) return false
      throw err
    }
  }

  /**
   * Read block data from a mifare tag.
   * @param opts The block to be read and the key info of the block.
   * @param opts.block The block to be read.
   * @param opts.keyType The key type of the block.
   * @param opts.key The key of the block.
   * @returns The block data read from a mifare tag.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = window.ChameleonUltraJS
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
    this._clearRxBufs()
    const cmd = Cmd.MF1_READ_ONE_BLOCK // cmd = 2008
    await this._writeCmd({ cmd, data: Buffer.pack('!BB6s', keyType, block, key) })
    return (await this._readRespTimeout({ cmd }))?.data
  }

  /**
   * Write data to a mifare tag.
   * @param opts The block to be written and the key info of the block.
   * @param opts.block The block to be written.
   * @param opts.keyType The key type of the block.
   * @param opts.key The key of the block.
   * @param opts.data The block data to be written.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = window.ChameleonUltraJS
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
    if (!Buffer.isBuffer(data) || data.length !== 16) throw new TypeError('data should be a Buffer with length 16')
    await this.assureDeviceMode(DeviceMode.READER)
    this._clearRxBufs()
    const cmd = Cmd.MF1_WRITE_ONE_BLOCK // cmd = 2009
    await this._writeCmd({ cmd, data: Buffer.pack('!BB6s16s', keyType, block, key, data) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Get the info composed of `cmdHf14aScan()` and `cmdMf1TestNtLevel()`.
   * @returns The info about 14a tag and mifare protocol.
   * @group Reader Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Mf1PrngType } = window.ChameleonUltraJS
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
  async hf14aInfo (): Promise<Decoder.Hf14aTagInfo[]> {
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
   * @param opts.activateRfField Set `true` to activate RF field. If `data` is not empty or `autoSelect` is true, `activateRfField` will be set to `true`.
   * @param opts.appendCrc Set `true` to add CRC before sending data.
   * @param opts.autoSelect Set `true` to automatically select card before sending data.
   * @param opts.checkResponseCrc Set `true` to verify CRC of response and remove. If CRC of response is valid, CRC will be removed from response, otherwise will throw HF_ERR_CRC error.
   * @param opts.data The data to be send. If `appendCrc` is `true`, the maximum length of data is `62`, otherwise is `64`.
   * @param opts.dataBitLength Number of bits to send. Useful for send partial byte. `dataBitLength` is incompatible with `appendCrc`.
   * @param opts.keepRfField Set `true` to keep the RF field active after sending.
   * @param opts.waitResponse Default value is `true`. Set `false` to skip reading tag response.
   * @param opts.timeout Default value is `1000 ms`. Maximum timeout for reading tag response in ms while `waitResponse` is `true`.
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

    if (!Buffer.isBuffer(data)) throw new TypeError('data should be a Buffer')
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
    this._clearRxBufs()
    const cmd = Cmd.HF14A_RAW // cmd = 2010
    await this._writeCmd({ cmd, data: buf1 })
    return (await this._readRespTimeout({ cmd, timeout: READ_DEFAULT_TIMEOUT + timeout }))?.data
  }

  /**
   * MIFARE Classic manipulate value block
   *
   * - Decrement: decrement value by `X` (`0` ~ `2147483647`) from src to dst
   * - Increment: increment value by `X` (`0` ~ `2147483647`) from src to dst
   * - Restore: copy value from src to dst (Restore and Transfer)
   *
   * @param src The key info of src block.
   * @param src.key The key of src block.
   * @param src.keyType The key type of src block.
   * @param src.block The block of src block.
   * @param operator The operator of value block.
   * @param operand The operand of value block.
   * @param dst The key info of dst block.
   * @param dst.key The key of dst block.
   * @param dst.keyType The key type of dst block.
   * @param dst.block The block of dst block.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType, Mf1VblockOperator } = window.ChameleonUltraJS
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
    this._clearRxBufs()
    const cmd = Cmd.MF1_MANIPULATE_VALUE_BLOCK // cmd = 2011
    const data = Buffer.pack('!BB6sBiBB6s', src.keyType, src.block, src.key, operator, operand, dst.keyType, dst.block, dst.key)
    await this._writeCmd({ cmd, data })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Get value from `opts` block (MIFARE Classic value block)
   * @param opts The key info of `opts` block.
   * @param opts.block The block of `opts` block.
   * @param opts.keyType The key type of `opts` block.
   * @param opts.key The key of `opts` block.
   * @returns The value and address of `opts` block.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType, Mf1VblockOperator } = window.ChameleonUltraJS
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
    const [adr1, adr2, adr3, adr4] = blkDt.subarray(12, 16)
    if (adr1 !== adr3 || adr2 !== adr4 || adr1 + adr2 !== 0xFF) throw new Error(`Invalid address of value block: ${blkDt.toString('hex')}`)
    return { adr: adr1, value: val1 }
  }

  /**
   * Set value X (-2147483647 ~ 2147483647) to `dst` block (MIFARE Classic value block)
   * @param dst The key info of `dst` block.
   * @param dst.block The block of `dst` block.
   * @param dst.keyType The key type of `dst` block.
   * @param dst.key The key of `dst` block.
   * @param val The value and address to be set.
   * @param val.value The value to be set. Default is `0`.
   * @param val.adr The address to be set. Default is `dst.block`.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType, Mf1VblockOperator } = window.ChameleonUltraJS
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
    this._clearRxBufs()
    const cmd = Cmd.EM410X_SCAN // cmd = 3000
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data
  }

  /**
   * Write id of em410x tag to t55xx tag.
   * @param id The id of em410x tag.
   * @group Reader Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = window.ChameleonUltraJS
   *   await ultra.cmdEm410xWriteToT55xx(Buffer.from('deadbeef88', 'hex'))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdEm410xWriteToT55xx (id: Buffer): Promise<void> {
    if (!Buffer.isBuffer(id) || id.length !== 5) throw new TypeError('id should be a Buffer with length 5')
    await this.assureDeviceMode(DeviceMode.READER)
    this._clearRxBufs()
    const cmd = Cmd.EM410X_WRITE_TO_T55XX // cmd = 3001
    const oldKeys = [0x51243648, 0x19920427]
    const data = Buffer.pack(`!5sI${oldKeys.length}I`, id, 0x20206666, ...oldKeys)
    await this._writeCmd({ cmd, data })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Set the mifare block data of actived slot.
   * @param offset The start block of actived slot.
   * @param data The data to be set. the length of data should be multiples of 16.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = window.ChameleonUltraJS
   *   await ultra.cmdMf1EmuWriteBlock(1, Buffer.alloc(16))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1EmuWriteBlock (offset: number, data: Buffer): Promise<void> {
    if (!_.isSafeInteger(offset)) throw new TypeError('Invalid offset')
    if (!Buffer.isBuffer(data) || data.length % 16 !== 0) throw new TypeError('data should be a Buffer with length be multiples of 16')
    this._clearRxBufs()
    const cmd = Cmd.MF1_WRITE_EMU_BLOCK_DATA // cmd = 4000
    await this._writeCmd({ cmd, data: Buffer.pack(`!B${data.length}s`, offset, data) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Set the mifare anti-collision data of actived slot.
   * @param opts.uid The new uid to be set.
   * @param opts.atqa `2 bytes`, the new atqa to be set.
   * @param opts.sak `1 byte`, the new sak to be set.
   * @param opts.ats The new ats to be set.
   * @group Emulator Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = window.ChameleonUltraJS
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
    if (!Buffer.isBuffer(uid) || !_.includes([4, 7, 10], uid.length)) throw new TypeError('uid should be a Buffer with length 4, 7 or 10')
    if (!Buffer.isBuffer(atqa) || atqa.length !== 2) throw new TypeError('atqa should be a Buffer with length 2')
    if (!Buffer.isBuffer(sak) || sak.length !== 1) throw new TypeError('sak should be a Buffer with length 1')
    if (!Buffer.isBuffer(ats)) throw new TypeError('ats should be a Buffer')
    this._clearRxBufs()
    const cmd = Cmd.HF14A_SET_ANTI_COLL_DATA // cmd = 4001
    await this._writeCmd({ cmd, data: Buffer.pack(`!${uid.length + 1}p2ss${ats.length + 1}p`, uid, atqa, sak, ats) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Enable or disable the mifare MFKey32 detection and clear the data of detections.
   * @param enable `true` to enable the detection, `false` to disable the detection.
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
    this._clearRxBufs()
    const cmd = Cmd.MF1_SET_DETECTION_ENABLE // cmd = 4004
    await this._writeCmd({ cmd, data: Buffer.pack('!?', enable) })
    await this._readRespTimeout({ cmd })
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
    this._clearRxBufs()
    const cmd = Cmd.MF1_GET_DETECTION_COUNT // cmd = 4005
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data.readUInt32BE()
  }

  /**
   * Get the data of mifare MFKey32 detections.
   * @param offset The start log of detections to be get.
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
  async cmdMf1GetDetectionLogs (offset: number = 0): Promise<Decoder.Mf1DetectionLog[]> {
    if (!_.isSafeInteger(offset)) throw new TypeError('Invalid offset')
    this._clearRxBufs()
    const cmd = Cmd.MF1_GET_DETECTION_LOG // cmd = 4006
    await this._writeCmd({ cmd, data: Buffer.pack('!I', offset) })
    return Decoder.Mf1DetectionLog.fromCmd4006((await this._readRespTimeout({ cmd }))?.data)
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
    this._clearRxBufs()
    const cmd = Cmd.MF1_GET_DETECTION_ENABLE // cmd = 4007
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data[0] === 1
  }

  /**
   * Get the mifare block data of actived slot.
   * @param offset The start block of actived slot.
   * @param length The count of blocks to be get.
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
    this._clearRxBufs()
    const cmd = Cmd.MF1_READ_EMU_BLOCK_DATA // cmd = 4008
    await this._writeCmd({ cmd, data: Buffer.pack('!BB', offset, length) })
    return (await this._readRespTimeout({ cmd }))?.data
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
  async cmdMf1GetEmuSettings (): Promise<Decoder.Mf1EmuSettings> {
    this._clearRxBufs()
    const cmd = Cmd.MF1_GET_EMULATOR_CONFIG // cmd = 4009
    await this._writeCmd({ cmd })
    return Decoder.Mf1EmuSettings.fromCmd4009((await this._readRespTimeout({ cmd }))?.data)
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
    this._clearRxBufs()
    const cmd = Cmd.MF1_GET_GEN1A_MODE // cmd = 4010
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data[0] === 1
  }

  /**
   * Set the mifare gen1a mode of actived slot.
   * @param enable `true` to enable the gen1a mode, `false` to disable the gen1a mode.
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
    this._clearRxBufs()
    const cmd = Cmd.MF1_SET_GEN1A_MODE // cmd = 4011
    await this._writeCmd({ cmd, data: Buffer.pack('!?', enable) })
    await this._readRespTimeout({ cmd })
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
    this._clearRxBufs()
    const cmd = Cmd.MF1_GET_GEN2_MODE // cmd = 4012
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data[0] === 1
  }

  /**
   * Set the mifare gen2 mode of actived slot.
   * @param enable `true` to enable the gen2 mode, `false` to disable the gen2 mode.
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
    this._clearRxBufs()
    const cmd = Cmd.MF1_SET_GEN2_MODE // cmd = 4013
    await this._writeCmd({ cmd, data: Buffer.pack('!?', enable) })
    await this._readRespTimeout({ cmd })
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
    this._clearRxBufs()
    const cmd = Cmd.HF14A_GET_BLOCK_ANTI_COLL_MODE // cmd = 4014
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data[0] === 1
  }

  /**
   * Set the mode of actived slot that using anti-collision data from block 0 for 4 byte UID tags or not.
   * @param enable `true` to enable the mode, `false` to disable the mode.
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
    this._clearRxBufs()
    const cmd = Cmd.HF14A_SET_BLOCK_ANTI_COLL_MODE // cmd = 4015
    await this._writeCmd({ cmd, data: Buffer.pack('!?', enable) })
    await this._readRespTimeout({ cmd })
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
    this._clearRxBufs()
    const cmd = Cmd.MF1_GET_WRITE_MODE // cmd = 4016
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data[0]
  }

  /**
   * Set the mifare write mode of actived slot.
   * @param mode The mifare write mode of actived slot.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Mf1EmuWriteMode } = window.ChameleonUltraJS
   *   await ultra.cmdMf1SetWriteMode(Mf1EmuWriteMode.NORMAL)
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdMf1SetWriteMode (mode: Mf1EmuWriteMode): Promise<void> {
    if (!isMf1EmuWriteMode(mode)) throw new TypeError('Invalid mode')
    this._clearRxBufs()
    const cmd = Cmd.MF1_SET_WRITE_MODE // cmd = 4017
    await this._writeCmd({ cmd, data: Buffer.pack('!B', mode) })
    await this._readRespTimeout({ cmd })
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
  async cmdHf14aGetAntiCollData (): Promise<Decoder.Hf14aAntiColl | null> {
    this._clearRxBufs()
    const cmd = Cmd.HF14A_GET_ANTI_COLL_DATA // cmd = 4018
    await this._writeCmd({ cmd })
    const data = (await this._readRespTimeout({ cmd }))?.data
    return data.length > 0 ? Decoder.Hf14aAntiColl.fromBuffer(data) : null
  }

  /**
   * Set the em410x id of actived slot.
   * @param id The em410x id of actived slot.
   * @group Emulator Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = window.ChameleonUltraJS
   *   await ultra.cmdEm410xSetEmuId(Buffer.from('deadbeef88', 'hex'))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async cmdEm410xSetEmuId (id: Buffer): Promise<void> {
    if (!Buffer.isBuffer(id) || id.length !== 5) throw new TypeError('id should be a Buffer with length 5')
    this._clearRxBufs()
    const cmd = Cmd.EM410X_SET_EMU_ID // cmd = 5000
    await this._writeCmd({ cmd, data: id })
    await this._readRespTimeout({ cmd })
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
    this._clearRxBufs()
    const cmd = Cmd.EM410X_GET_EMU_ID // cmd = 5001
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data
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
   * Read 4 pages (16 bytes) from Mifare Ultralight
   * @param opts.pageOffset page number to read
   * @returns 4 pages (16 bytes)
   * @group Mifare Ultralight Related
   * @see [MF0ICU1 MIFARE Ultralight contactless single-ticket IC](https://www.nxp.com/docs/en/data-sheet/MF0ICU1.pdf#page=16)
   * @example
   * ```js
   * async function run (ultra) {
   *   const data = await ultra.mfuReadPages({ pageOffset: 0 })
   *   console.log(data.toString('hex')) // '040dc445420d2981e7480000e1100600'
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuReadPages (opts: { pageOffset: number }): Promise<Buffer> {
    const { pageOffset } = opts
    if (!_.isSafeInteger(pageOffset)) throw new TypeError('Invalid pageOffset')
    return await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: true,
      checkResponseCrc: true,
      data: Buffer.pack('!BB', 0x30, pageOffset),
    })
  }

  /**
   * Write 1 page (4 bytes) to Mifare Ultralight
   * @param opts.pageOffset page number to read
   * @param opts.data `4 bytes`, the page data to be written.
   * @group Mifare Ultralight Related
   * @see [MF0ICU1 MIFARE Ultralight contactless single-ticket IC](https://www.nxp.com/docs/en/data-sheet/MF0ICU1.pdf#page=17)
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = window.ChameleonUltraJS
   *   const data = await ultra.mfuWritePage({ pageOffset: 9, data: Buffer.from('00000000', 'hex') })
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mfuWritePage (opts: { pageOffset: number, data: Buffer }): Promise<void> {
    const { pageOffset, data } = opts
    if (!_.isSafeInteger(pageOffset)) throw new TypeError('Invalid pageOffset')
    if (!Buffer.isBuffer(data) || data.length !== 4) throw new TypeError('data should be a Buffer with length 4')
    await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: true,
      checkResponseCrc: true,
      data: Buffer.pack('!BB4s', 0xA2, pageOffset, data),
    })
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
   */
  async mf1Halt (): Promise<void> {
    await this.cmdHf14aRaw({ appendCrc: true, data: Buffer.pack('!H', 0x5000), waitResponse: false }) // HALT + close RF field
  }

  /**
   * Magic auth helper function for mifare gen1a tag.
   * @param cb The callback function to be executed after auth.
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
   * @param offset The start block of Mifare Classic Gen1a.
   * @param length The amount of blocks to read.
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
   * @param offset The start block of Mifare Classic Gen1a.
   * @param data The blocks data to write.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = window.ChameleonUltraJS
   *   await ultra.mf1Gen1aWriteBlocks(1, new Buffer(16))
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  async mf1Gen1aWriteBlocks (offset: number, data: Buffer): Promise<void> {
    if (!_.isSafeInteger(offset)) throw new TypeError('Invalid offset')
    if (!Buffer.isBuffer(data) || data.length % 16 !== 0) throw new TypeError('data should be a Buffer with length be multiples of 16')
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
   * @param sector The sector number.
   * @returns The blockNo of sector trailer.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run () {
   *   const { ChameleonUltra } = window.ChameleonUltraJS
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
   * @param sector The sector number to be checked.
   * @param keys The keys dictionary.
   * @returns The Key A and Key B of the sector.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = window.ChameleonUltraJS
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
    keys = _.chain(keys)
      .filter(key => Buffer.isBuffer(key) && key.length === 6)
      .uniqWith(Buffer.equals)
      .value()
    const sectorKey: { [Mf1KeyType.KEY_A]?: Buffer, [Mf1KeyType.KEY_B]?: Buffer } = {}
    const block = ChameleonUltra.mf1TrailerBlockNoOfSector(sector)
    // check key A
    for (const key of keys) {
      if (!await this.cmdMf1CheckBlockKey({ block, key, keyType: Mf1KeyType.KEY_A })) continue
      sectorKey[Mf1KeyType.KEY_A] = key
      // shortcut: try to read key B from trailer of sector
      try {
        const keyB = (await this.cmdMf1ReadBlock({ block, key, keyType: Mf1KeyType.KEY_A })).subarray(10)
        if (_.sum(keyB) > 0) { // key B in trailer
          sectorKey[Mf1KeyType.KEY_B] = keyB
          return sectorKey
        }
      } catch (err) {
        if (!this.isConnected()) throw err
      }
      break
    }
    // check key B
    for (const key of keys) {
      if (!await this.cmdMf1CheckBlockKey({ block, key, keyType: Mf1KeyType.KEY_B })) continue
      sectorKey[Mf1KeyType.KEY_B] = key
      break
    }
    return sectorKey
  }

  /**
   * Read the sector data of Mifare Classic by given keys.
   * @param sector The sector number to be read.
   * @param keys The keys dictionary.
   * @returns The sector data and the read status of each block.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer, Mf1KeyType } = window.ChameleonUltraJS
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
    if (_.keys(sectorKey).length === 0) throw new Error('No valid key')
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
          this.logger.core(`Failed to read block ${sector * 4 + i} with ${Mf1KeyType[keyType]} = ${key.toString('hex')}`)
        }
      }
    }
    if (!_.isNil(sectorKey[Mf1KeyType.KEY_A])) data.set(sectorKey[Mf1KeyType.KEY_A], 48)
    if (!_.isNil(sectorKey[Mf1KeyType.KEY_B])) data.set(sectorKey[Mf1KeyType.KEY_B], 58)
    return { data, success }
  }

  /**
   * Write the sector data of Mifare Classic by given keys.
   * @param sector The sector number to be written.
   * @param keys The key dictionary.
   * @param data Sector data
   * @returns the write status of each block.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = window.ChameleonUltraJS
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
    if (!Buffer.isBuffer(data) || data.length !== 64) throw new TypeError('data should be a Buffer with length 64')
    if (!this.mf1IsValidAcl(data)) throw new TypeError('Invalid ACL bytes of data')
    const sectorKey = await this.mf1CheckSectorKeys(sector, keys)
    if (_.keys(sectorKey).length === 0) throw new Error('No valid key')
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
          this.logger.core(`Failed to write block ${sector * 4 + i} with ${Mf1KeyType[keyType]} = ${key.toString('hex')}`)
        }
      }
    }
    return { success }
  }

  /**
   * Check acl bytes of ACL, block or sector.
   * @param data Data of ACL, block or sector.
   * @returns `true` if the acl bytes is valid, `false` otherwise.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   const { Buffer } = window.ChameleonUltraJS
   *   console.log(ultra.mf1IsValidAcl(Buffer.from('ff078069', 'hex'))) // true
   * }
   *
   * await run(vm.ultra) // you can run in DevTools of https://taichunmin.idv.tw/chameleon-ultra.js/test.html
   * ```
   */
  mf1IsValidAcl (data: Buffer): boolean {
    if (!Buffer.isBuffer(data) || !_.includes([3, 4, 16, 64], data.length)) throw new TypeError('data should be a Buffer with length 3, 4, 16 or 64')
    if (data.length === 16) data = data.subarray(6)
    else if (data.length === 64) data = data.subarray(54)

    const acl: number[] = []
    for (let i = 0; i < 3; i++) acl.push((data[i] & 0xF0) >>> 4, data[i] & 0x0F)
    return _.every([[1, 2], [0, 5], [3, 4]], ([a, b]: [number, number]) => (acl[a] ^ acl[b]) === 0xF)
  }
}

/**
 * @internal
 * @group Internal
 */
export type Logger = Debugger | ((...args: any[]) => void)

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
])

const RespStatusFail = new Set([
  RespStatus.HF_TAG_NOT_FOUND,
  RespStatus.HF_ERR_STAT,
  RespStatus.HF_ERR_CRC,
  RespStatus.HF_COLLISION,
  RespStatus.HF_ERR_BCC,
  RespStatus.MF_ERR_AUTH,
  RespStatus.HF_ERR_PARITY,
  RespStatus.HF_ERR_ATS,

  RespStatus.EM410X_TAG_NOT_FOUND,

  RespStatus.PAR_ERR,
  RespStatus.DEVICE_MODE_ERROR,
  RespStatus.INVALID_CMD,
  RespStatus.NOT_IMPLEMENTED,
  RespStatus.FLASH_WRITE_FAIL,
  RespStatus.FLASH_READ_FAIL,
])

export interface ChameleonSerialPort<I, O> {
  isOpen?: () => boolean
  readable: ReadableStream<I>
  writable: WritableStream<O>
}

class ChameleonRxSink implements UnderlyingSink<Buffer> {
  bufs: Buffer[] = []
  controller: AbortController

  constructor () {
    this.controller = new AbortController()
  }

  get signal (): AbortSignal { return this.controller.signal }

  write (chunk: Buffer): void {
    this.bufs.push(Buffer.from(chunk))
  }
}

/**
 * @internal
 * @group Plugin Related
 */
export type PluginInstallContext = { // eslint-disable-line @typescript-eslint/consistent-type-definitions
  Buffer: typeof Buffer
  ultra: ChameleonUltra
}

/**
 * @internal
 * @group Plugin Related
 */
export interface ChameleonPlugin {
  name: string
  install: <T extends PluginInstallContext>(context: T, pluginOption: any) => Promise<unknown>
}

class ChameleonUltraFrame {
  buf: Buffer

  constructor (buf: Buffer) {
    this.buf = buf
  }

  static inspect (buf: any): string {
    if (!Buffer.isBuffer(buf)) return 'Invalid frame'
    // sof + sof lrc + cmd (2) + status (2) + data len (2) + head lrc + data + data lrc
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
  get inspect (): string { return ChameleonUltraFrame.inspect(this.buf) }
  get status (): number { return this.buf.readUInt16BE(4) }
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

export { Decoder as ResponseDecoder }
