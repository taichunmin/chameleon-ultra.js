import _ from 'lodash'
import { Buffer } from './buffer'
import { createIsEnum, createIsEnumInteger, errToJson, middlewareCompose, sleep, type MiddlewareComposeFn, versionCompare } from './helper'
import { debug as createDebugger, type Debugger } from 'debug'
import { type ReadableStream, type UnderlyingSink, WritableStream } from 'node:stream/web'
import * as Decoder from './ResponseDecoder'

const READ_DEFAULT_TIMEOUT = 5e3
const START_OF_FRAME = new Buffer(2).writeUInt16BE(0x11EF)
const VERSION_SUPPORTED = { gte: '2.0', lt: '3.0' } as const

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
   *   const { Buffer, ChameleonUltra, WebbleAdapter, WebserialAdapter } = ChameleonUltraJS
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
   * const { Buffer, ChameleonUltra } = require('chameleon-ultra.js')
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
   * import { Buffer, ChameleonUltra } from 'chameleon-ultra.js'
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
  async invokeHook (hook: string, ctx: any = {}, next: MiddlewareComposeFn): Promise<unknown> {
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
   * @param args
   * @internal
   * @group Internal
   */
  async _writeCmd ({ cmd, status = 0, data = Buffer.allocUnsafe(0) }: WriteCmdArgs): Promise<void> {
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
   * const { DeviceMode } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.TAG)
   * }
   * ```
   */
  async cmdChangeDeviceMode (mode: DeviceMode): Promise<void> {
    if (!isDeviceMode(mode)) throw new TypeError('Invalid device mode')
    this._clearRxBufs()
    const cmd = Cmd.CHANGE_DEVICE_MODE // cmd = 1001
    await this._writeCmd({ cmd, data: new Buffer([mode]) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Get current mode of device.
   * @returns Current mode of device.
   * @group Device Related
   * @example
   * ```js
   * const { DeviceMode } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   const deviceMode = await ultra.cmdGetDeviceMode()
   *   console.log(DeviceMode[deviceMode]) // 'TAG'
   * }
   * ```
   */
  async cmdGetDeviceMode (): Promise<DeviceMode> {
    this._clearRxBufs()
    const cmd = Cmd.GET_DEVICE_MODE // cmd = 1002
    await this._writeCmd({ cmd })
    const data = (await this._readRespTimeout({ cmd }))?.data
    return data[0]
  }

  /**
   * Change the active emulation tag slot of device.
   * @param slot The slot to be active.
   * @group Slot Related
   * @example
   * ```js
   * const { Slot } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdSlotSetActive(Slot.SLOT_1)
   * }
   * ```
   */
  async cmdSlotSetActive (slot: Slot): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    this._clearRxBufs()
    const cmd = Cmd.SET_ACTIVE_SLOT // cmd = 1003
    await this._writeCmd({ cmd, data: new Buffer([slot]) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Change the emulation tag type of specified slot.
   * @param slot The slot to be set.
   * @param tagType The tag type to be set.
   * @group Slot Related
   * @example
   * ```js
   * const { Slot, TagType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdSlotChangeTagType(Slot.SLOT_1, TagType.MIFARE_1024)
   * }
   * ```
   */
  async cmdSlotChangeTagType (slot: Slot, tagType: TagType): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isTagType(tagType)) throw new TypeError('Invalid tag type')
    const data = new Buffer(3)
    data[0] = slot
    data.writeUInt16BE(tagType, 1)
    this._clearRxBufs()
    const cmd = Cmd.SET_SLOT_TAG_TYPE // cmd = 1004
    await this._writeCmd({ cmd, data })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Reset the emulation tag data of specified tag type in specified slot to default values.
   * @param slot The slot to be reset.
   * @param tagType The tag type to be reset.
   * @group Slot Related
   * @example
   * ```js
   * const { Slot, TagType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdSlotResetTagType(Slot.SLOT_1, TagType.MIFARE_1024)
   * }
   * ```
   */
  async cmdSlotResetTagType (slot: Slot, tagType: TagType): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isTagType(tagType)) throw new TypeError('Invalid tagType')
    this._clearRxBufs()
    const cmd = Cmd.SET_SLOT_DATA_DEFAULT // cmd = 1005
    const data = new Buffer(3)
    data[0] = slot
    data.writeUInt16BE(tagType, 1)
    await this._writeCmd({ cmd, data })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Enable or disable the specified slot.
   * @param slot The slot to be enable/disable.
   * @param enable `true` to enable the slot, `false` to disable the slot.
   * @group Slot Related
   * @example
   * ```js
   * const { Slot } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdSlotSetEnable(Slot.SLOT_1, true)
   * }
   * ```
   */
  async cmdSlotSetEnable (slot: Slot, freq: FreqType, enable: number | boolean): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    this._clearRxBufs()
    const cmd = Cmd.SET_SLOT_ENABLE // cmd = 1006
    await this._writeCmd({ cmd, data: new Buffer([slot, freq, Boolean(enable) ? 1 : 0]) })
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
   * const { Slot, FreqType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdSlotSetFreqName(Slot.SLOT_1, FreqType.HF, 'My Tag')
   * }
   * ```
   */
  async cmdSlotSetFreqName (slot: Slot, freq: FreqType, name: string): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isFreqType(freq) || freq < 1) throw new TypeError('freq should be 1 or 2')
    const data = Buffer.concat([new Buffer([slot, freq]), Buffer.from(name)])
    if (!_.inRange(data.length, 3, 35)) throw new TypeError('byteLength of name should between 1 and 32')
    this._clearRxBufs()
    const cmd = Cmd.SET_SLOT_TAG_NICK // cmd = 1007
    await this._writeCmd({ cmd, data })
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
   * const { Slot, FreqType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   const name = await ultra.cmdSlotGetFreqName(Slot.SLOT_1, FreqType.HF)
   *   console.log(name) // 'My Tag'
   * }
   * ```
   */
  async cmdSlotGetFreqName (slot: Slot, freq: FreqType): Promise<string | undefined> {
    try {
      if (!isSlot(slot)) throw new TypeError('Invalid slot')
      if (!isFreqType(freq) || freq < 1) throw new TypeError('freq should be 1 or 2')
      this._clearRxBufs()
      const cmd = Cmd.GET_SLOT_TAG_NICK // cmd = 1008
      await this._writeCmd({ cmd, data: new Buffer([slot, freq]) })
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
   *   await ultra.cmdMf1EmuWriteBlock(1, Buffer.alloc(16))
   *   await ultra.cmdSlotSaveSettings()
   * }
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
   * ```
   */
  async cmdEnterBootloader (): Promise<void> {
    this._clearRxBufs()
    const cmd = Cmd.ENTER_BOOTLOADER // cmd = 1010
    await this._writeCmd({ cmd })
    await this._readRespTimeout({ cmd })
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
   * const { AnimationMode } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdSetAnimationMode(AnimationMode.SHORT)
   * }
   * ```
   */
  async cmdSetAnimationMode (mode: AnimationMode): Promise<void> {
    if (!isAnimationMode(mode)) throw new TypeError('Invalid animation mode')
    this._clearRxBufs()
    const cmd = Cmd.SET_ANIMATION_MODE // cmd = 1015
    await this._writeCmd({ cmd, data: new Buffer([mode]) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Get the animation mode of device while wake-up and sleep.
   * @returns The animation mode of device.
   * @group Device Related
   * @example
   * ```js
   * const { AnimationMode } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   const mode = await ultra.cmdGetAnimationMode()
   *   console.log(AnimationMode[mode]) // 'FULL'
   * }
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
   * const { Slot } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   const slot = await ultra.cmdSlotGetActive()
   *   console.log(Slot[slot]) // 'SLOT_1'
   * }
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
   * const { Slot, FreqType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   console.log(await ultra.cmdSlotDeleteFreqName(Slot.SLOT_1, FreqType.HF)) // true
   * }
   */
  async cmdSlotDeleteFreqName (slot: Slot, freq: FreqType): Promise<boolean> {
    try {
      if (!isSlot(slot)) throw new TypeError('Invalid slot')
      if (!isFreqType(freq) || freq < 1) throw new TypeError('freq should be 1 or 2')
      this._clearRxBufs()
      const cmd = Cmd.DELETE_SLOT_TAG_NICK // cmd = 1021
      await this._writeCmd({ cmd, data: new Buffer([slot, freq]) })
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
   * const { Slot, FreqType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdSlotDeleteFreqType(Slot.SLOT_1, FreqType.HF)
   * }
   * ```
   */
  async cmdSlotDeleteFreqType (slot: Slot, freq: FreqType): Promise<void> {
    if (!isSlot(slot)) throw new TypeError('Invalid slot')
    if (!isFreqType(freq)) throw new TypeError('Invalid freq')
    this._clearRxBufs()
    const cmd = Cmd.DELETE_SLOT_SENSE_TYPE // cmd = 1024
    await this._writeCmd({ cmd, data: new Buffer([slot, freq]) })
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
   * const { ButtonType, ButtonAction } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   const btnAction = await ultra.cmdGetButtonPressAction(ButtonType.BUTTON_A)
   *   console.log(ButtonAction[btnAction]) // 'CYCLE_SLOT_INC'
   * }
   * ```
   */
  async cmdGetButtonPressAction (btn: ButtonType): Promise<ButtonAction> {
    if (!isButtonType(btn)) throw new TypeError('Invalid button type')
    this._clearRxBufs()
    const cmd = Cmd.GET_BUTTON_PRESS_CONFIG // cmd = 1026
    await this._writeCmd({ cmd, data: Buffer.fromUtf8String(btn) })
    return (await this._readRespTimeout({ cmd }))?.data[0]
  }

  /**
   * Set the button press action of specified button.
   * @param btn The button to be set.
   * @param action The button press action to be set.
   * @group Device Related
   * @example
   * ```js
   * const { ButtonType, ButtonAction } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdSetButtonPressAction(ButtonType.BUTTON_A, ButtonAction.CYCLE_SLOT_INC)
   * }
   * ```
   */
  async cmdSetButtonPressAction (btn: ButtonType, action: ButtonAction): Promise<void> {
    if (!isButtonType(btn)) throw new TypeError('Invalid button type')
    if (!isButtonAction(action)) throw new TypeError('Invalid button action')
    this._clearRxBufs()
    const cmd = Cmd.SET_BUTTON_PRESS_CONFIG // cmd = 1027
    const data = new Buffer(2)
    data.write(btn, 0, 'utf8')
    data[1] = action
    await this._writeCmd({ cmd, data })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Get the button long press action of specified button.
   * @param btn The button to be get.
   * @returns The button long press action of specified button.
   * @group Device Related
   * @example
   * ```js
   * const { ButtonType, ButtonAction } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   const btnAction = await ultra.cmdGetButtonLongPressAction(ButtonType.BUTTON_A)
   *   console.log(ButtonAction[btnAction]) // 'CLONE_IC_UID'
   * }
   * ```
   */
  async cmdGetButtonLongPressAction (btn: ButtonType): Promise<ButtonAction> {
    if (!isButtonType(btn)) throw new TypeError('Invalid button type')
    this._clearRxBufs()
    const cmd = Cmd.GET_LONG_BUTTON_PRESS_CONFIG // cmd = 1028
    await this._writeCmd({ cmd, data: Buffer.fromUtf8String(btn) })
    return (await this._readRespTimeout({ cmd }))?.data[0]
  }

  /**
   * Set the button long press action of specified button.
   * @param btn The button to be set.
   * @param action The button long press action to be set.
   * @group Device Related
   * @example
   * ```js
   * const { ButtonType, ButtonAction } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdSetButtonLongPressAction(ButtonType.BUTTON_A, ButtonAction.CYCLE_SLOT_INC)
   * }
   * ```
   */
  async cmdSetButtonLongPressAction (btn: ButtonType, action: ButtonAction): Promise<void> {
    if (!isButtonType(btn)) throw new TypeError('Invalid button type')
    if (!isButtonAction(action)) throw new TypeError('Invalid button action')
    this._clearRxBufs()
    const cmd = Cmd.SET_LONG_BUTTON_PRESS_CONFIG // cmd = 1029
    const data = new Buffer(2)
    data.write(btn, 0)
    data[1] = action
    await this._writeCmd({ cmd, data })
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
   * const { DeviceModel } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   const model = await ultra.cmdGetDeviceModel()
   *   console.log(DeviceModel[model]) // 'ULTRA'
   * }
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
   * ```
   */
  async cmdBleSetPairingMode (enable: number | boolean): Promise<void> {
    this._clearRxBufs()
    const cmd = Cmd.SET_BLE_PAIRING_ENABLE // cmd = 1037
    await this._writeCmd({ cmd, data: new Buffer([Boolean(enable) ? 1 : 0]) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Scan 14a tag, and return basic information. The device mode must be set to READER before using this command.
   * @returns The basic infomation of scanned tag.
   * @throws This command will throw an error if tag not scanned or any error occured.
   * @group Reader Related
   * @example
   * ```js
   * const { DeviceMode } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const antiColl = _.first(await ultra.cmdHf14aScan())
   *   console.log(_.mapValues(antiColl, val => val.toString('hex')))
   *   // { uid: '040dc4420d2981', atqa: '4400', sak: '00', ats: ''}
   * }
   * ```
   */
  async cmdHf14aScan (): Promise<Decoder.Hf14aAntiColl[]> {
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
   * const { DeviceMode } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   console.log(await ultra.cmdMf1IsSupport()) // true
   * }
   * ```
   */
  async cmdMf1IsSupport (): Promise<boolean> {
    try {
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
   * const { DeviceMode, Mf1PrngType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   console.log(Mf1PrngType[await ultra.cmdMf1TestPrngType()]) // 'WEAK'
   * }
   * ```
   */
  async cmdMf1TestPrngType (): Promise<Mf1PrngType> {
    this._clearRxBufs()
    const cmd = Cmd.MF1_DETECT_NT_LEVEL // cmd = 2002
    await this._writeCmd({ cmd })
    return (await this._readRespTimeout({ cmd }))?.data[0]
  }

  /**
   * Check if the tag is suffer from mifare darkside attack.
   * @param args
   * @returns The detect result of mifare darkside attack.
   * @group Mifare Classic Related
   * @example
   * ```js
   * const { DeviceMode, Mf1KeyType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const res1 = await ultra.cmdMf1AcquireStaticNested({
   *     src: { block: 0, keyType: Mf1KeyType.KEY_A, key },
   *     dst: { block: 4, keyType: Mf1KeyType.KEY_A },
   *   })
   *   const res = {
   *     uid: res1.uid.toString('hex'),
   *     nts: _.map(res1.nts, item => ({ nt1: item.nt1.toString('hex'), nt2: item.nt2.toString('hex') })),
   *   }
   *   console.log(res)
   *   // {
   *   //   uid: 'b908a16d',
   *   //   nts: [
   *   //     { nt1: '01200145', nt2: '81901975' },
   *   //     { nt1: '01200145', nt2: 'cdd400f3' },
   *   //   ],
   *   // }
   * }
   * ```
   */
  async cmdMf1AcquireStaticNested ({
    src: { block: srcBlock, keyType: srcKeyType, key: srcKey },
    dst: { block: dstBlock, keyType: dstKeyType },
  }: CmdMf1AcquireStaticNestedArgs): Promise<Decoder.Mf1AcquireStaticNestedRes> {
    if (!Buffer.isBuffer(srcKey) || srcKey.length !== 6) throw new TypeError('src.key should be a Buffer with length 6')
    if (!isMf1KeyType(srcKeyType)) throw new TypeError('Invalid src.keyType')
    if (!isMf1KeyType(dstKeyType)) throw new TypeError('Invalid dst.keyType')
    this._clearRxBufs()
    const cmd = Cmd.MF1_STATIC_NESTED_ACQUIRE // cmd = 2003
    await this._writeCmd({
      cmd,
      data: Buffer.concat([
        new Buffer([srcKeyType, srcBlock]),
        srcKey,
        new Buffer([dstKeyType, dstBlock]),
      ]),
    })
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
   * @alpha
   */
  async cmdMf1AcquireDarkside (block = 0, keyType = Mf1KeyType.KEY_A, isFirst = false, syncMax: number = 15): Promise<Decoder.Mf1DarksideArgs> {
    if (!isMf1KeyType(keyType)) throw new TypeError('Invalid keyType')
    this._clearRxBufs()
    const cmd = Cmd.MF1_DARKSIDE_ACQUIRE // cmd = 2004
    await this._writeCmd({ cmd, data: new Buffer([keyType, block, isFirst ? 1 : 0, syncMax]) })
    return Decoder.Mf1DarksideArgs.fromCmd2004((await this._readRespTimeout({ cmd, timeout: syncMax * 1e4 }))?.data)
  }

  /**
   * Dectect the nt distance of mifare protocol.
   * @param args
   * @returns The nt distance of mifare protocol.
   * @group Mifare Classic Related
   * @example
   * ```js
   * const { DeviceMode, Mf1KeyType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const res1 = await ultra.cmdMf1TestNtDistance({
   *     src: { block: 0, keyType: Mf1KeyType.KEY_A, key },
   *   })
   *   const res2 = await ultra.cmdMf1AcquireNested({
   *     src: { block: 0, keyType: Mf1KeyType.KEY_A, key },
   *     dst: { block: 4, keyType: Mf1KeyType.KEY_A },
   *   })
   *   const res = {
   *     uid: res1.uid.toString('hex'),
   *     dist: res1.dist.toString('hex'),
   *     nts: _.map(res2, item => ({
   *       nt1: item.nt1.toString('hex'),
   *       nt2: item.nt2.toString('hex'),
   *       par: item.par,
   *     }))
   *   }
   *   console.log(res)
   *   // {
   *   //   uid: '877209e1',
   *   //   dist: '00000080',
   *   //   nts: [
   *   //     { nt1: '35141fcb', nt2: '40430522', par: 7 },
   *   //     { nt1: 'cff2b3ef', nt2: '825ba8ea', par: 5 },
   *   //   ]
   *   // }
   * }
   * ```
   */
  async cmdMf1TestNtDistance ({
    src: { block: srcBlock, keyType: srcKeyType, key: srcKey },
  }: CmdTestMf1NtDistanceArgs): Promise<Decoder.Mf1NtDistanceArgs> {
    if (!isMf1KeyType(srcKeyType)) throw new TypeError('Invalid src.keyType')
    if (!Buffer.isBuffer(srcKey) || srcKey.length !== 6) throw new TypeError('src.key should be a Buffer with length 6')
    this._clearRxBufs()
    const cmd = Cmd.MF1_DETECT_NT_DIST // cmd = 2005
    await this._writeCmd({ cmd, data: Buffer.concat([new Buffer([srcKeyType, srcBlock]), srcKey]) })
    return Decoder.Mf1NtDistanceArgs.fromCmd2005((await this._readRespTimeout({ cmd }))?.data)
  }

  /**
   * Acquire the data from mifare nested attack.
   * @param args
   * @returns The data from mifare nested attack.
   * @group Mifare Classic Related
   * @example
   * ```js
   * const { DeviceMode, Mf1KeyType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const res1 = await ultra.cmdMf1TestNtDistance({
   *     src: { block: 0, keyType: Mf1KeyType.KEY_A, key },
   *   })
   *   const res2 = await ultra.cmdMf1AcquireNested({
   *     src: { block: 0, keyType: Mf1KeyType.KEY_A, key },
   *     dst: { block: 4, keyType: Mf1KeyType.KEY_A },
   *   })
   *   const res = {
   *     uid: res1.uid.toString('hex'),
   *     dist: res1.dist.toString('hex'),
   *     nts: _.map(res2, item => ({
   *       nt1: item.nt1.toString('hex'),
   *       nt2: item.nt2.toString('hex'),
   *       par: item.par,
   *     }))
   *   }
   *   console.log(res)
   *   // {
   *   //   uid: '877209e1',
   *   //   dist: '00000080',
   *   //   nts: [
   *   //     { nt1: '35141fcb', nt2: '40430522', par: 7 },
   *   //     { nt1: 'cff2b3ef', nt2: '825ba8ea', par: 5 },
   *   //   ]
   *   // }
   * }
   * ```
   */
  async cmdMf1AcquireNested ({
    src: { block: srcBlock, keyType: srcKeyType, key: srcKey },
    dst: { block: dstBlock, keyType: dstKeyType },
  }: CmdMf1AcquireNestedArgs): Promise<Decoder.Mf1NestedRes[]> {
    if (!Buffer.isBuffer(srcKey) || srcKey.length !== 6) throw new TypeError('src.key should be a Buffer with length 6')
    if (!isMf1KeyType(srcKeyType)) throw new TypeError('Invalid src.keyType')
    if (!isMf1KeyType(dstKeyType)) throw new TypeError('Invalid dst.keyType')
    this._clearRxBufs()
    const cmd = Cmd.MF1_NESTED_ACQUIRE // cmd = 2006
    await this._writeCmd({
      cmd,
      data: Buffer.concat([
        new Buffer([srcKeyType, srcBlock]),
        srcKey,
        new Buffer([dstKeyType, dstBlock]),
      ]),
    })
    return Decoder.Mf1NestedRes.fromCmd2006((await this._readRespTimeout({ cmd }))?.data)
  }

  /**
   * Check if the key is valid for specified block and key type.
   * @param args
   * @returns `true` if the key is valid for specified block and key type.
   * @group Mifare Classic Related
   * @example
   * ```js
   * const { Buffer, Mf1KeyType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   console.log(await ultra.cmdMf1CheckBlockKey({
   *     block: 0,
   *     keyType: Mf1KeyType.KEY_A,
   *     key,
   *   })) // true
   * }
   * ```
   */
  async cmdMf1CheckBlockKey ({ block = 0, keyType = Mf1KeyType.KEY_A, key = Buffer.from('FFFFFFFFFFFF', 'hex') }: CmdCheckMf1BlockKeyArgs = {}): Promise<boolean> {
    try {
      if (!isMf1KeyType(keyType)) throw new TypeError('Invalid keyType')
      if (!Buffer.isBuffer(key) || key.length !== 6) throw new TypeError('key should be a Buffer with length 6')
      this._clearRxBufs()
      const cmd = Cmd.MF1_AUTH_ONE_KEY_BLOCK // cmd = 2007
      await this._writeCmd({ cmd, data: Buffer.concat([new Buffer([keyType, block]), key]) })
      await this._readRespTimeout({ cmd })
      return true
    } catch (err) {
      if (err.status === RespStatus.MF_ERR_AUTH) return false
      throw err
    }
  }

  /**
   * Read data from specified block.
   * @param args
   * @returns The data read from specified block.
   * @group Mifare Classic Related
   * @example
   * ```js
   * const { Buffer, Mf1KeyType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const block1 = await ultra.cmdMf1ReadBlock({
   *     block: 1,
   *     keyType: Mf1KeyType.KEY_A,
   *     key,
   *   })
   *   console.log(block1.toString('hex')) // '00000000000000000000000000000000'
   * }
   * ```
   */
  async cmdMf1ReadBlock ({ block = 0, keyType = Mf1KeyType.KEY_A, key = Buffer.from('FFFFFFFFFFFF', 'hex') }: CmdReadMf1BlockArgs = {}): Promise<Buffer> {
    if (!isMf1KeyType(keyType)) throw new TypeError('Invalid keyType')
    if (!Buffer.isBuffer(key) || key.length !== 6) throw new TypeError('key should be a Buffer with length 6')
    this._clearRxBufs()
    const cmd = Cmd.MF1_READ_ONE_BLOCK // cmd = 2008
    await this._writeCmd({ cmd, data: Buffer.concat([new Buffer([keyType, block]), key]) })
    return (await this._readRespTimeout({ cmd }))?.data
  }

  /**
   * Write data to specified block.
   * @param args
   * @group Mifare Classic Related
   * @example
   * ```js
   * const { Buffer, Mf1KeyType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const key = Buffer.from('FFFFFFFFFFFF', 'hex')
   *   const block1 = Buffer.from('00000000000000000000000000000000', 'hex')
   *   await ultra.cmdMf1WriteBlock({
   *     block: 1,
   *     keyType: Mf1KeyType.KEY_A,
   *     key,
   *     data: block1,
   *   })
   * }
   * ```
   */
  async cmdMf1WriteBlock ({ block = 0, keyType = Mf1KeyType.KEY_A, key = Buffer.from('FFFFFFFFFFFF', 'hex'), data }: CmdWriteMf1BlockArgs = {}): Promise<void> {
    if (!isMf1KeyType(keyType)) throw new TypeError('Invalid keyType')
    if (!Buffer.isBuffer(key) || key.length !== 6) throw new TypeError('key should be a Buffer with length 6')
    if (!Buffer.isBuffer(data) || data.length !== 16) throw new TypeError('data should be a Buffer with length 16')
    this._clearRxBufs()
    const cmd = Cmd.MF1_WRITE_ONE_BLOCK // cmd = 2009
    await this._writeCmd({ cmd, data: Buffer.concat([new Buffer([keyType, block]), key, data]) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Get the info composed of `cmdHf14aScan()` and `cmdMf1TestNtLevel()`.
   * @returns The info about 14a tag and mifare protocol.
   * @group Reader Related
   * @example
   * ```js
   * const { DeviceMode, Mf1PrngType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const tag = _.first(await ultra.hf14aInfo())
   *   console.log(tag.nxpTypeBySak) // 'MIFARE Classic 1K | Plus SE 1K | Plug S 2K | Plus X 2K'
   *   console.log(Mf1PrngType[tag.prngType]) // 'WEAK'
   *   console.log(_.mapValues(tag.antiColl, val => val.toString('hex')))
   *   // { uid: 'dbe3d63d', atqa: '0400', sak: '08', ats: '' }
   * }
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
   * @param args
   * @returns The response from tag.
   * @group Reader Related
   */
  async cmdHf14aRaw ({
    activateRfField = false,
    waitResponse = true,
    appendCrc = false,
    autoSelect = false,
    keepRfField = false,
    checkResponseCrc = false,
    dataBitLength = 0,
    timeout = 1000,
    data = new Buffer(),
  }: CmdHf14aRawArgs): Promise<Buffer> {
    const buf1 = new Buffer(data.length + 5)

    // options
    for (const [bitOffset, val] of [
      [0, activateRfField],
      [1, waitResponse],
      [2, appendCrc],
      [3, autoSelect],
      [4, keepRfField],
      [5, checkResponseCrc],
    ] as Array<[number, boolean]>) buf1.writeBitMSB(bitOffset, val)

    buf1.writeUInt16BE(timeout, 1)
    // [8, 1, 2, 3, 4, 5, 6, 7]
    dataBitLength = (data.length - 1) * 8 + (dataBitLength + 7) % 8 + 1
    buf1.writeUInt16BE(dataBitLength, 3)
    if (data.length > 0) data.copy(buf1, 5)

    this._clearRxBufs()
    const cmd = Cmd.HF14A_RAW // cmd = 2010
    await this._writeCmd({ cmd, data: buf1 }) // cmd = 2010
    return (await this._readRespTimeout({ cmd, timeout: READ_DEFAULT_TIMEOUT + timeout }))?.data
  }

  /**
   * Scan em410x tag and print id
   * @returns The id of em410x tag.
   * @group Reader Related
   * @example
   * ```js
   * const { Buffer } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *
   *   const id = await ultra.cmdEm410xScan()
   *   console.log(id.toString('hex')) // 'deadbeef88'
   * }
   * ```
   */
  async cmdEm410xScan (): Promise<Buffer> {
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
   * const { Buffer } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   await ultra.cmdEm410xWriteToT55xx(Buffer.from('deadbeef88', 'hex'))
   * }
   * ```
   */
  async cmdEm410xWriteToT55xx (id: Buffer): Promise<void> {
    if (!Buffer.isBuffer(id) || id.length !== 5) throw new TypeError('id should be a Buffer with length 5')
    this._clearRxBufs()
    const cmd = Cmd.EM410X_WRITE_TO_T55XX // cmd = 3001
    const data = new Buffer(17)
    id.copy(data, 0)
    data.writeUInt32BE(0x20206666, 5) // new key
    data.writeUInt32BE(0x51243648, 9) // old key 1
    data.writeUInt32BE(0x19920427, 13) // old key 2
    await this._writeCmd({ cmd, data })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Set the mifare block data of actived slot.
   * @param blockStart The start block of actived slot.
   * @param data The data to be set. the length of data should be multiples of 16.
   * @group Mifare Classic Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdMf1EmuWriteBlock(1, Buffer.alloc(16))
   * }
   * ```
   */
  async cmdMf1EmuWriteBlock (blockStart: number = 0, data: Buffer): Promise<void> {
    if (!Buffer.isBuffer(data) || data.length % 16 !== 0) throw new TypeError('data should be a Buffer with length be multiples of 16')
    this._clearRxBufs()
    const cmd = Cmd.MF1_WRITE_EMU_BLOCK_DATA // cmd = 4000
    await this._writeCmd({ cmd, data: Buffer.concat([new Buffer([blockStart]), data]) })
    await this._readRespTimeout({ cmd })
  }

  /**
   * Set the mifare anti-collision data of actived slot.
   * @param args
   * @group Emulator Related
   * @example
   * ```js
   * async function run (ultra) {
   *   await ultra.cmdHf14aSetAntiCollData({
   *     atqa: Buffer.from('0400', 'hex'),
   *     sak: Buffer.from('08', 'hex'),
   *     uid: Buffer.from('01020304', 'hex')
   *   })
   * }
   * ```
   */
  async cmdHf14aSetAntiCollData ({ uid, atqa, sak, ats = new Buffer() }: Decoder.Hf14aAntiColl): Promise<void> {
    if (!Buffer.isBuffer(uid) || !_.includes([4, 7, 10], uid.length)) throw new TypeError('uid should be a Buffer with length 4, 7 or 10')
    if (!Buffer.isBuffer(atqa) || atqa.length !== 2) throw new TypeError('atqa should be a Buffer with length 2')
    if (!Buffer.isBuffer(sak) || sak.length !== 1) throw new TypeError('sak should be a Buffer with length 1')
    if (!Buffer.isBuffer(ats)) throw new TypeError('ats should be a Buffer')
    this._clearRxBufs()
    const cmd = Cmd.HF14A_SET_ANTI_COLL_DATA // cmd = 4001
    await this._writeCmd({ cmd, data: Buffer.concat([Buffer.from([uid.length]), uid, atqa, sak, Buffer.from([ats.length]), ats]) })
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
   * ```
   */
  async cmdMf1SetDetectionEnable (enable: number | boolean): Promise<void> {
    this._clearRxBufs()
    const cmd = Cmd.MF1_SET_DETECTION_ENABLE // cmd = 4004
    await this._writeCmd({ cmd, data: new Buffer([Boolean(enable) ? 1 : 0]) })
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
   * @param index The start index of detections to be get.
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
   * ```
   */
  async cmdMf1GetDetectionLogs (index: number = 0): Promise<Decoder.Mf1DetectionLog[]> {
    this._clearRxBufs()
    const cmd = Cmd.MF1_GET_DETECTION_LOG // cmd = 4006
    await this._writeCmd({ cmd, data: new Buffer(4).writeUInt32BE(index) })
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
   * ```
   */
  async cmdMf1EmuReadBlock (offset: number = 0, length: number = 1): Promise<Buffer> {
    this._clearRxBufs()
    const cmd = Cmd.MF1_READ_EMU_BLOCK_DATA // cmd = 4008
    await this._writeCmd({ cmd, data: new Buffer([offset, length]) })
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
   *   await ultra.cmdMf1SetGen1aMode(false))
   * }
   * ```
   */
  async cmdMf1SetGen1aMode (enable: number | boolean): Promise<void> {
    this._clearRxBufs()
    const cmd = Cmd.MF1_SET_GEN1A_MODE // cmd = 4011
    await this._writeCmd({ cmd, data: new Buffer([Boolean(enable) ? 1 : 0]) })
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
   *   await ultra.cmdMf1SetGen2Mode(false))
   * }
   * ```
   */
  async cmdMf1SetGen2Mode (enable: number | boolean): Promise<void> {
    this._clearRxBufs()
    const cmd = Cmd.MF1_SET_GEN2_MODE // cmd = 4013
    await this._writeCmd({ cmd, data: new Buffer([Boolean(enable) ? 1 : 0]) })
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
   *   await ultra.cmdMf1SetAntiCollMode(false))
   * }
   * ```
   */
  async cmdMf1SetAntiCollMode (enable: number | boolean): Promise<void> {
    this._clearRxBufs()
    const cmd = Cmd.HF14A_SET_BLOCK_ANTI_COLL_MODE // cmd = 4015
    await this._writeCmd({ cmd, data: new Buffer([Boolean(enable) ? 1 : 0]) })
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
   * ```
   */
  async cmdMf1GetWriteMode (): Promise<EmuMf1WriteMode> {
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
   *   await ultra.cmdMf1SetWriteMode(0))
   * }
   * ```
   */
  async cmdMf1SetWriteMode (mode: EmuMf1WriteMode): Promise<void> {
    if (!isEmuMf1WriteMode(mode)) throw new TypeError('Invalid emu write mode')
    this._clearRxBufs()
    const cmd = Cmd.MF1_SET_WRITE_MODE // cmd = 4017
    await this._writeCmd({ cmd, data: new Buffer([mode]) })
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
   *   await ultra.cmdEm410xSetEmuId(Buffer.from('deadbeef88', 'hex'))
   * }
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
   * ```
   */
  async isSupportedAppVersion (): Promise<boolean> {
    const version = await this.cmdGetAppVersion()
    return versionCompare(version, VERSION_SUPPORTED.gte) >= 0 && versionCompare(version, VERSION_SUPPORTED.lt) < 0
  }

  /**
   * Read 4 pages (16 bytes) from Mifare Ultralight
   * @param args
   * @param args.pageOffset page number to read
   * @returns 4 pages (16 bytes)
   * @group Mifare Ultralight Related
   * @see [MF0ICU1 MIFARE Ultralight contactless single-ticket IC](https://www.nxp.com/docs/en/data-sheet/MF0ICU1.pdf#page=16)
   * @example
   * ```js
   * const { DeviceMode } = window.ChameleonUltraJS
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const data = await ultra.mfuReadPages({ pageOffset: 0 })
   *   console.log(data.toString('hex')) // '040dc445420d2981e7480000e1100600'
   * }
   * ```
   */
  async mfuReadPages ({ pageOffset }: { pageOffset: number }): Promise<Buffer> {
    return await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: true,
      checkResponseCrc: true,
      data: new Buffer([0x30, pageOffset]),
    })
  }

  /**
   * Write 1 page (4 bytes) to Mifare Ultralight
   * @param args
   * @param args.pageOffset page number to read
   * @param args.data 1 page data (4 bytes)
   * @group Mifare Ultralight Related
   * @see [MF0ICU1 MIFARE Ultralight contactless single-ticket IC](https://www.nxp.com/docs/en/data-sheet/MF0ICU1.pdf#page=17)
   * @example
   * ```js
   * const { DeviceMode } = window.ChameleonUltraJS
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const data = await ultra.mfuWritePage({ pageOffset: 9, data: Buffer.from('00000000', 'hex') })
   * }
   * ```
   */
  async mfuWritePage ({ pageOffset, data }: { pageOffset: number, data: Buffer }): Promise<void> {
    if (!Buffer.isBuffer(data) || data.length !== 4) throw new TypeError('data should be a Buffer with length 4')
    await this.cmdHf14aRaw({
      appendCrc: true,
      autoSelect: true,
      checkResponseCrc: true,
      data: Buffer.concat([new Buffer([0xA2, pageOffset]), data]),
    })
  }

  /**
   * Send Mifare Classic HALT command and close RF field.
   * @group Mifare Classic Related
   * @example
   * ```js
   * const { DeviceMode } = window.ChameleonUltraJS
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   await ultra.mf1Halt()
   * }
   */
  async mf1Halt (): Promise<void> {
    await this.cmdHf14aRaw({ appendCrc: true, data: new Buffer([0x50, 0x00]), waitResponse: false }) // HALT + close RF field
  }

  /**
   * Magic auth helper function for mifare gen1a tag.
   * @param cb The callback function to be executed after auth.
   * @returns The result of callback function.
   * @group Mifare Classic Related
   */
  async _mf1Gen1aAuth<T extends (...args: any) => any> (cb: T): Promise<Awaited<ReturnType<T>>> {
    try {
      await this.mf1Halt()
      const resp1 = await this.cmdHf14aRaw({ data: new Buffer([0x40]), dataBitLength: 7, keepRfField: true }) // 0x40 (7)
      if (resp1[0] !== 0x0A) throw new Error('Gen1a auth failed 1')
      const resp2 = await this.cmdHf14aRaw({ data: new Buffer([0x43]), keepRfField: true }) // 0x43
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
   * const { DeviceMode } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const card = await ultra.mf1Gen1aReadBlocks(0, 64)
   *   console.log(_.map(card.chunk(16), chunk => chunk.toString('hex')).join('\n'))
   * }
   * ```
   */
  async mf1Gen1aReadBlocks (offset: number, length: number = 1): Promise<Buffer> {
    return await this._mf1Gen1aAuth(async () => {
      const buf = new Buffer(length * 16)
      for (let i = 0; i < length; i++) {
        buf.set(await this.cmdHf14aRaw({
          appendCrc: true,
          checkResponseCrc: true,
          data: new Buffer([0x30, offset + i]),
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
   * const { DeviceMode } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   await ultra.mf1Gen1aWriteBlocks(1, new Buffer(16))
   * }
   * ```
   */
  async mf1Gen1aWriteBlocks (offset: number, data: Buffer): Promise<void> {
    if (!Buffer.isBuffer(data) || data.length % 16 !== 0) throw new TypeError('data should be a Buffer with length be multiples of 16')
    await this._mf1Gen1aAuth(async () => {
      const blocks = data.chunk(16)
      for (let i = 0; i < blocks.length; i++) {
        const resp1 = await this.cmdHf14aRaw({ appendCrc: true, data: new Buffer([0xA0, offset + i]), keepRfField: true })
        if (resp1[0] !== 0x0A) throw new Error('Gen1a write failed 1')
        const resp2 = await this.cmdHf14aRaw({ appendCrc: true, data: blocks[i], keepRfField: true })
        if (resp2[0] !== 0x0A) throw new Error('Gen1a write failed 2')
      }
    })
  }

  /**
   * Given a list of keys, check which is the correct key A and key B of the sector.
   * @param sector The sector number to be checked.
   * @param keys The keys dictionary.
   * @returns The Key A and Key B of the sector.
   * @group Mifare Classic Related
   * @example
   * ```js
   * const { DeviceMode, Mf1KeyType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   const keys = Buffer.from('FFFFFFFFFFFF\n000000000000\nA0A1A2A3A4A5\nD3F7D3F7D3F7', 'hex').chunk(6)
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const sectorKey = await ultra.mf1CheckSectorKeys(0, keys)
   *   console.log(_.mapValues(sectorKey, key => key.toString('hex')))
   *   // { "96": "ffffffffffff", "97": "ffffffffffff" }
   * }
   */
  async mf1CheckSectorKeys (sector: number, keys: Buffer[]): Promise<Partial<Record<Mf1KeyType, Buffer>>> {
    keys = _.chain(keys)
      .filter(key => Buffer.isBuffer(key) && key.length === 6)
      .uniqBy(key => key.toString('hex'))
      .value()
    if (keys.length === 0) throw new TypeError('keys should be an array of Buffer with length 6')
    const sectorKey: Partial<Record<Mf1KeyType, Buffer>> = {}
    for (const keyType of [Mf1KeyType.KEY_B, Mf1KeyType.KEY_A]) {
      for (const key of keys) {
        if (!await this.cmdMf1CheckBlockKey({ block: sector * 4 + 3, keyType, key })) continue
        sectorKey[keyType] = key
        break
      }
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
   * const { DeviceMode, Mf1KeyType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
   *   const keys = Buffer.from('FFFFFFFFFFFF\n000000000000\nA0A1A2A3A4A5\nD3F7D3F7D3F7', 'hex').chunk(6)
   *   const { data, success } = await ultra.mf1ReadSectorByKeys(0, keys)
   *   console.log({ data: data.toString('hex'), success })
   *   // { "data": "...", "success": [true, true, true, true] }
   * }
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
   * const { DeviceMode, Mf1KeyType } = window.ChameleonUltraJS
   *
   * async function run (ultra) {
   *   await ultra.cmdChangeDeviceMode(DeviceMode.READER)
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
   *   console.log(ultra.mf1IsValidAcl(Buffer.from('ff078069', 'hex'))) // true
   * }
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

/**
 * @internal
 * @group Internal
 */
export type WriteCmdArgs = { // eslint-disable-line @typescript-eslint/consistent-type-definitions
  /**
   * The command to be sent to device.
   */
  cmd: Cmd

  /**
   * The data of command.
   */
  status?: number

  /**
   * The data of command.
   */
  data?: Buffer
}

export enum Cmd {
  GET_APP_VERSION = 1000,
  CHANGE_DEVICE_MODE = 1001,
  GET_DEVICE_MODE = 1002,
  SET_ACTIVE_SLOT = 1003,
  SET_SLOT_TAG_TYPE = 1004,
  SET_SLOT_DATA_DEFAULT = 1005,
  SET_SLOT_ENABLE = 1006,
  SET_SLOT_TAG_NICK = 1007,
  GET_SLOT_TAG_NICK = 1008,
  SLOT_DATA_CONFIG_SAVE = 1009,
  ENTER_BOOTLOADER = 1010,
  GET_DEVICE_CHIP_ID = 1011,
  GET_DEVICE_ADDRESS = 1012,
  SAVE_SETTINGS = 1013,
  RESET_SETTINGS = 1014,
  SET_ANIMATION_MODE = 1015,
  GET_ANIMATION_MODE = 1016,
  GET_GIT_VERSION = 1017,
  GET_ACTIVE_SLOT = 1018,
  GET_SLOT_INFO = 1019,
  WIPE_FDS = 1020,
  DELETE_SLOT_TAG_NICK = 1021,
  GET_ENABLED_SLOTS = 1023,
  DELETE_SLOT_SENSE_TYPE = 1024,
  GET_BATTERY_INFO = 1025,
  GET_BUTTON_PRESS_CONFIG = 1026,
  SET_BUTTON_PRESS_CONFIG = 1027,
  GET_LONG_BUTTON_PRESS_CONFIG = 1028,
  SET_LONG_BUTTON_PRESS_CONFIG = 1029,
  SET_BLE_PAIRING_KEY = 1030,
  GET_BLE_PAIRING_KEY = 1031,
  DELETE_ALL_BLE_BONDS = 1032,
  GET_DEVICE_MODEL = 1033,
  GET_DEVICE_SETTINGS = 1034,
  GET_DEVICE_CAPABILITIES = 1035,
  GET_BLE_PAIRING_ENABLE = 1036,
  SET_BLE_PAIRING_ENABLE = 1037,

  HF14A_SCAN = 2000,
  MF1_DETECT_SUPPORT = 2001,
  MF1_DETECT_NT_LEVEL = 2002,
  MF1_STATIC_NESTED_ACQUIRE = 2003,
  MF1_DARKSIDE_ACQUIRE = 2004,
  MF1_DETECT_NT_DIST = 2005,
  MF1_NESTED_ACQUIRE = 2006,
  MF1_AUTH_ONE_KEY_BLOCK = 2007,
  MF1_READ_ONE_BLOCK = 2008,
  MF1_WRITE_ONE_BLOCK = 2009,
  HF14A_RAW = 2010,

  EM410X_SCAN = 3000,
  EM410X_WRITE_TO_T55XX = 3001,

  MF1_WRITE_EMU_BLOCK_DATA = 4000,
  HF14A_SET_ANTI_COLL_DATA = 4001,
  MF1_SET_ANTI_COLLISION_INFO = 4002,
  MF1_SET_ATS_RESOURCE = 4003,
  MF1_SET_DETECTION_ENABLE = 4004,
  MF1_GET_DETECTION_COUNT = 4005,
  MF1_GET_DETECTION_LOG = 4006,
  MF1_GET_DETECTION_ENABLE = 4007,
  MF1_READ_EMU_BLOCK_DATA = 4008,
  MF1_GET_EMULATOR_CONFIG = 4009,
  MF1_GET_GEN1A_MODE = 4010,
  MF1_SET_GEN1A_MODE = 4011,
  MF1_GET_GEN2_MODE = 4012,
  MF1_SET_GEN2_MODE = 4013,
  HF14A_GET_BLOCK_ANTI_COLL_MODE = 4014,
  HF14A_SET_BLOCK_ANTI_COLL_MODE = 4015,
  MF1_GET_WRITE_MODE = 4016,
  MF1_SET_WRITE_MODE = 4017,
  HF14A_GET_ANTI_COLL_DATA = 4018,

  EM410X_SET_EMU_ID = 5000,
  EM410X_GET_EMU_ID = 5001,
}

export enum Slot {
  SLOT_1 = 0,
  SLOT_2 = 1,
  SLOT_3 = 2,
  SLOT_4 = 3,
  SLOT_5 = 4,
  SLOT_6 = 5,
  SLOT_7 = 6,
  SLOT_8 = 7,
}
export const isSlot = createIsEnumInteger(Slot)

export enum FreqType {
  /** No Freq */
  NONE = 0,
  /** Low Freq: 125 kHz */
  LF = 1,
  /** High Freq: 13.56 MHz */
  HF = 2,
}
export const isFreqType = createIsEnumInteger(FreqType)

export enum TagType {
  // 特定的且必須存在的標誌不存在的類型
  UNDEFINED = 0,
  // 1xx: ASK Tag-Talk-First
  EM410X = 100,
  // 2xx: FSK Tag-Talk-First
  // 3xx: PSK Tag-Talk-First
  // 4xx: Reader-Talk-First
  LF_END = 999,
  // 10xx: MIFARE Classic series
  MIFARE_Mini = 1000,
  MIFARE_1024 = 1001,
  MIFARE_2048 = 1002,
  MIFARE_4096 = 1003,
  // 11xx: MFUL / NTAG series
  NTAG_213 = 1100,
  NTAG_215 = 1101,
  NTAG_216 = 1102,
  // 12xx: MIFARE Plus series
  // 13xx: DESFire series
  // 14xx: ST25TA series
  // 15xx: HF14A-4 series
}
export const isTagType = createIsEnumInteger(TagType)

export enum DeviceMode {
  TAG = 0,
  READER = 1,
}
export const isDeviceMode = createIsEnumInteger(DeviceMode)

export enum RespStatus {
  /** IC card operation is successful */
  HF_TAG_OK = 0x00,
  /** IC card not found */
  HF_TAG_NOT_FOUND = 0x01,
  /** Abnormal IC card status */
  HF_ERR_STAT = 0x02,
  /** IC card communication verification abnormal */
  HF_ERR_CRC = 0x03,
  /** IC card conflict */
  HF_COLLISION = 0x04,
  /** IC card BCC error */
  HF_ERR_BCC = 0x05,
  /** MF card verification failed */
  MF_ERR_AUTH = 0x06,
  /** IC card parity error */
  HF_ERR_PARITY = 0x07,
  /** ATS should be present but card NAKed, or ATS too large */
  HF_ERR_ATS = 0x08,

  /** LF tag operation is successful */
  LF_TAG_OK = 0x40,
  /** EM410X tag not found error */
  EM410X_TAG_NOT_FOUND = 0x41,

  /** Invalid param error */
  PAR_ERR = 0x60,
  /** Wrong device mode error */
  DEVICE_MODE_ERROR = 0x66,
  /** invalid cmd error */
  INVALID_CMD = 0x67,
  /** Device operation succeeded */
  DEVICE_SUCCESS = 0x68,
  /** Not implemented error */
  NOT_IMPLEMENTED = 0x69,
  /** Flash write failed */
  FLASH_WRITE_FAIL = 0x70,
  /** Flash read failed */
  FLASH_READ_FAIL = 0x71,
}

export const RespStatusMsg = new Map([
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

export const RespStatusSuccess = new Set([
  RespStatus.DEVICE_SUCCESS,
  RespStatus.HF_TAG_OK,
  RespStatus.LF_TAG_OK,
])

export const RespStatusFail = new Set([
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

export enum ButtonType {
  BUTTON_A = 'A',
  BUTTON_B = 'B',
}
export const isButtonType = createIsEnum(ButtonType)

export enum ButtonAction {
  /** No Function */
  DISABLE = 0,
  /** Select next slot */
  CYCLE_SLOT_INC = 1,
  /** Select previous slot */
  CYCLE_SLOT_DEC = 2,
  /** Read then simulate the ID/UID card number */
  CLONE_IC_UID = 3,
  /** Show Battery Level */
  BATTERY = 4,
}
export const isButtonAction = createIsEnumInteger(ButtonAction)

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

export class ChameleonUltraFrame {
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

export enum Mf1PrngType {
  /** StaticNested: the random number of the card response is fixed */
  STATIC = 0,
  /** Nested: the random number of the card response is weak */
  WEAK = 1,
  /** HardNested: the random number of the card response is unpredictable */
  HARD = 2,
}

export enum DarksideStatus {
  /** normal process */
  OK = 0,
  /** the random number cannot be fixed, this situation may appear on some UID card */
  CANT_FIX_NT = 1,
  /** the direct authentification is successful, maybe the key is just the default one */
  LUCKY_AUTH_OK = 2,
  /** the card does not respond to NACK, it may be a card that fixes Nack logic vulnerabilities */
  NO_NAK_SENT = 3,
  /** card change while running DARKSIDE */
  TAG_CHANGED = 4,
}

export enum Mf1KeyType {
  KEY_A = 0x60,
  KEY_B = 0x61,
}
export const isMf1KeyType = createIsEnumInteger(Mf1KeyType)

export type CmdReadMf1BlockArgs = { // eslint-disable-line @typescript-eslint/consistent-type-definitions
  block?: number
  keyType?: Mf1KeyType
  key?: Buffer
}

export type CmdCheckMf1BlockKeyArgs = { // eslint-disable-line @typescript-eslint/consistent-type-definitions
  block?: number
  keyType?: Mf1KeyType
  key?: Buffer
}

export type CmdWriteMf1BlockArgs = { // eslint-disable-line @typescript-eslint/consistent-type-definitions
  block?: number
  keyType?: Mf1KeyType
  key?: Buffer
  data?: Buffer
}

export enum DeviceModel {
  ULTRA = 0,
  LITE = 1,
}

export enum EmuMf1WriteMode {
  /** Normal write as standard mifare */
  NORMAL = 0,
  /** Send NACK to write attempts */
  DENIED = 1,
  /** Acknowledge writes, but don't remember contents */
  DECEIVE = 2,
  /** Store data to RAM, but not save to persistent storage */
  SHADOW = 3,
  /** Shadow requested, will be changed to SHADOW and stored to ROM */
  SHADOW_REQ = 4,
}
export const isEmuMf1WriteMode = createIsEnumInteger(EmuMf1WriteMode)

export enum AnimationMode {
  FULL = 0,
  SHORT = 1,
  NONE = 2,
}
export const isAnimationMode = createIsEnumInteger(AnimationMode)

export type CmdTestMf1NtDistanceArgs = { // eslint-disable-line @typescript-eslint/consistent-type-definitions
  src: {
    keyType: Mf1KeyType
    block: number
    key: Buffer
  }
}

export type CmdMf1AcquireStaticNestedArgs = { // eslint-disable-line @typescript-eslint/consistent-type-definitions
  src: {
    block: number
    key: Buffer
    keyType: Mf1KeyType
  }
  dst: {
    block: number
    keyType: Mf1KeyType
  }
}

export type CmdMf1AcquireNestedArgs = { // eslint-disable-line @typescript-eslint/consistent-type-definitions
  src: {
    block: number
    key: Buffer
    keyType: Mf1KeyType
  }
  dst: {
    block: number
    keyType: Mf1KeyType
  }
}

export type CmdHf14aRawArgs = { // eslint-disable-line @typescript-eslint/consistent-type-definitions
  /** Set `true` to activate RF field. If `data` is not empty or `autoSelect` is true, `activateRfField` will be set to `true`. */
  activateRfField?: boolean
  /** Set `true` to add CRC before sending data. */
  appendCrc?: boolean
  /** Set `true` to automatically select card before sending data */
  autoSelect?: boolean
  /** Set `true` to verify CRC of response and remove. If CRC of response is valid, CRC will be removed from response, otherwise will throw HF_ERR_CRC error. */
  checkResponseCrc?: boolean
  /** The data to be send. If `appendCrc` is `true`, the maximum length of data is `62`, otherwise is `64`. */
  data?: Buffer
  /** Number of bits to send. Useful for send partial byte. `dataBitLength` is incompatible with `appendCrc`. */
  dataBitLength?: number
  /** Set `true` to keep the RF field on after sending. */
  keepRfField?: boolean
  /** Default value is `true`. Set `false` to skip reading tag response. */
  waitResponse?: boolean
  /** Default value is `1000 ms`. Maximum timeout for reading tag response in ms while `waitResponse` is `true`. */
  timeout?: number
}

/**
 * @see [MIFARE type identification procedure](https://www.nxp.com/docs/en/application-note/AN10833.pdf)
 */
export const NxpTypeBySak = new Map([
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
