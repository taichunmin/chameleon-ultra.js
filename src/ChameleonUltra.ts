import _ from 'lodash'
import { Buffer } from './buffer'
import { ResponseDecoder, type EmuMf1AntiColl, type Hf14aInfoResp } from './ResponseDecoder'
import { createIsEnum, middlewareCompose, sleep, type MiddlewareComposeFn } from './helper'
import { debug as createDebugger, type Debugger } from 'debug'
import { type ReadableStream, type UnderlyingSink, WritableStream } from 'node:stream/web'

const READ_DEFAULT_TIMEOUT = 5e3
const START_OF_FRAME = new Buffer(2).writeUInt16BE(0x11EF)

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

  /** The firmware version of ChameleonUltra */
  versionString: string = ''

  /**
   * Create a new instance of ChameleonUltra.
   * @param debug Enable debug mode.
   * @example
   * Example usage in Browser:
   *
   * ```js
   * // <script src="./iife/index.min.js"></script>
   * // <script src="./iife/plugin/WebbleAdapter.min.js"></script>
   * // <script src="./iife/plugin/WebserialAdapter.min.js"></script>
   * const { Buffer, ChameleonUltra, WebbleAdapter, WebserialAdapter } = ChameleonUltraJS
   *
   * const ultraUsb = new ChameleonUltra()
   * ultraUsb.use(new WebserialAdapter())
   *
   * const ultraBle = new ChameleonUltra()
   * ultraBle.use(new WebbleAdapter())
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
   * @group Methods related to device
   */
  async connect (): Promise<void> {
    await this.invokeHook('connect', {}, async (ctx, next) => {
      try {
        if (_.isNil(this.port)) throw new Error('this.port is undefined. Did you remember to use adapter plugin?')

        // serial.readable pipeTo this.rxSink
        this.rxSink = new ChameleonRxSink()
        void this.port.readable.pipeTo(new WritableStream(this.rxSink), {
          signal: this.rxSink.signal,
        }).catch(err => {
          void this.disconnect()
          throw _.merge(new Error(`Failed to read resp: ${err.message}`), { originalError: err })
        })

        this.versionString = `${await this.cmdGetAppVersion()} (${await this.cmdGetGitVersion()})`
        this.logger.core(`connected, version = ${this.versionString}`)
      } catch (err) {
        this.logger.core(`Failed to connect: ${err.message as string}`)
        if (this.isConnected()) await this.disconnect()
        throw _.merge(new Error(err.message ?? 'Failed to connect'), { originalError: err })
      }
    })
  }

  /**
   * Disconnect ChameleonUltra.
   * @group Methods related to device
   */
  async disconnect (): Promise<void> {
    try {
      if (this.isDisconnecting) return
      this.isDisconnecting = true // 避免重複執行
      await this.invokeHook('disconnect', {}, async (ctx, next) => {
        try {
          this.logger.core('disconnected')
          this.rxSink?.controller.abort(new Error('disconnected'))
          while (this.port?.readable?.locked === true) await sleep(10)
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
   * @group Methods related to device
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
  async _readRespTimeout ({ timeout }: { timeout?: number } = {}): Promise<ChameleonUltraFrame> {
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
          buf = buf.subarray(sofIdx) // ignore bytes before SOF
          // sof + sof lrc + cmd (2) + status (2) + data len (2) + head lrc + data + data lrc
          if (buf.length < 10) throw new Error('buf.length < 10')
          if (this._calcLrc(buf.subarray(2, 8)) !== buf[8]) throw _.merge(new Error('head lrc mismatch'), { skip: 1 })
          const lenFrame = buf.readUInt16BE(6) + 10
          if (buf.length < lenFrame) throw new Error('waiting for more data')
          if (this._calcLrc(buf.subarray(9, -1)) !== buf[buf.length - 1]) throw _.merge(new Error('data lrc mismatch'), { skip: 1 })
          if (buf.length > lenFrame) this.rxSink.bufs.unshift(buf.subarray(lenFrame))
          ctx.resp = new ChameleonUltraFrame(buf.subarray(0, lenFrame))
          break
        } catch (err) {
          const skip = err.skip ?? 0
          if (skip > 0) buf = buf.subarray(skip)
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
   * @group Commands related to device
   */
  async cmdGetAppVersion (): Promise<string> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_APP_VERSION }) // cmd = 1000
    const data = (await this._readRespTimeout())?.data
    return `${data[1]}.${data[0]}`
  }

  /**
   * Change device mode to tag reader or tag emulator.
   * @param mode The mode to be changed.
   * @group Commands related to device
   */
  async cmdChangeDeviceMode (mode: DeviceMode): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.CHANGE_DEVICE_MODE, data: Buffer.from([mode]) }) // cmd = 1001
    await this._readRespTimeout()
  }

  /**
   * Get current mode of device.
   * @returns Current mode of device.
   * @group Commands related to device
   */
  async cmdGetDeviceMode (): Promise<DeviceMode> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_DEVICE_MODE }) // cmd = 1002
    const data = (await this._readRespTimeout())?.data
    return data[0] as DeviceMode
  }

  /**
   * Change the active emulation tag slot of device.
   * @param slot The slot to be active.
   * @group Commands related to slot
   */
  async cmdSetActiveSlot (slot: Slot): Promise<void> {
    if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('Invalid slot')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_ACTIVE_SLOT, data: Buffer.from([slot]) }) // cmd = 1003
    await this._readRespTimeout()
  }

  /**
   * Change the emulation tag type of specified slot.
   * @param slot The slot to be set.
   * @param tagType The tag type to be set.
   * @group Commands related to slot
   */
  async cmdSetSlotTagType (slot: Slot, tagType: TagType): Promise<void> {
    if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('Invalid slot')
    if (!_.isSafeInteger(tagType) || !isTagType(tagType)) throw new TypeError('Invalid tag type')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_SLOT_TAG_TYPE, data: Buffer.from([slot, tagType]) }) // cmd = 1004
    await this._readRespTimeout()
  }

  /**
   * Reset the emulation tag data of specified tag type in specified slot to default values.
   * @param slot The slot to be reset.
   * @param tagType The tag type to be reset.
   * @group Commands related to slot
   */
  async cmdResetSlotData (slot: Slot, tagType: TagType): Promise<void> {
    if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('Invalid slot')
    if (!_.isSafeInteger(tagType) || !isTagType(tagType)) throw new TypeError('Invalid tagType')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_SLOT_DATA_DEFAULT, data: Buffer.from([slot, tagType]) }) // cmd = 1005
    await this._readRespTimeout()
  }

  /**
   * Enable or disable the specified slot.
   * @param slot The slot to be enable/disable.
   * @param enable `true` to enable the slot, `false` to disable the slot.
   * @group Commands related to slot
   */
  async cmdSetSlotEnable (slot: Slot, enable: boolean): Promise<void> {
    if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('Invalid slot')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_SLOT_ENABLE, data: Buffer.from([slot, enable ? 1 : 0]) }) // cmd = 1006
    await this._readRespTimeout()
  }

  /**
   * Set the nickname of specified freq type in specified slot.
   * @param slot The slot to be set.
   * @param freq The freq type to be set.
   * @param name The name to be set. The `byteLength` of name should between `1` and `32`.
   * @group Commands related to slot
   */
  async cmdSetSlotTagName (slot: Slot, freq: FreqType, name: string): Promise<void> {
    const data = Buffer.concat([Buffer.from([slot, freq]), Buffer.from(name)])
    if (!_.inRange(data.length, 3, 35)) throw new TypeError('byteLength of name should between 1 and 32')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.SET_SLOT_TAG_NICK, // cmd = 1007
      data: Buffer.concat([Buffer.from([slot, freq]), Buffer.from(name)]),
    })
    await this._readRespTimeout()
  }

  /**
   * Get the nickname of specified freq type in specified slot.
   * @param slot The slot to be get.
   * @param freq The freq type to be get.
   * @returns The nickname of specified freq type in specified slot.
   * @group Commands related to slot
   */
  async cmdGetSlotTagName (slot: Slot, freq: FreqType): Promise<string | undefined> {
    try {
      if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('slot should between 0 and 7')
      if (!_.isSafeInteger(freq) || !isFreqType(freq) || freq < 1) throw new TypeError('freq should be 1 or 2')
      this._clearRxBufs()
      await this._writeCmd({ cmd: Cmd.GET_SLOT_TAG_NICK, data: Buffer.from([slot, freq]) }) // cmd = 1008
      return (await this._readRespTimeout())?.data.toString('utf8')
    } catch (err) {
      if (err.status === RespStatus.FLASH_READ_FAIL) return // slot name is empty
      throw err
    }
  }

  /**
   * The SlotConfig, hf tag data and lf tag data will be written to persistent storage. But the slot nickname is not affected by this command.
   * @group Commands related to slot
   */
  async cmdSaveSlotConfig (): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SLOT_DATA_CONFIG_SAVE }) // cmd = 1009
    await this._readRespTimeout()
  }

  /**
   * Enter bootloader mode.
   * @group Commands related to device
   */
  async cmdEnterBootloader (): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.ENTER_BOOTLOADER }) // cmd = 1010
    await this._readRespTimeout()
  }

  /**
   * Get chipset id of device in hex format.
   * @returns Chipset id of device in hex format.
   * @group Commands related to device
   */
  async cmdGetDeviceChipId (): Promise<string> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_DEVICE_CHIP_ID }) // cmd = 1011
    const data = (await this._readRespTimeout())?.data
    return data.toString('hex')
  }

  /**
   * Get the ble address of device.
   * @returns The ble address of device.
   * @group Commands related to device
   */
  async cmdBleGetAddress (): Promise<string> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_DEVICE_ADDRESS }) // cmd = 1012
    const data = (await this._readRespTimeout())?.data
    const arr = []
    for (let i = data.length - 1; i >= 0; i--) arr.push(data.subarray(i, i + 1).toString('hex'))
    return _.toUpper(arr.join(':'))
  }

  /**
   * Set the animation mode of device while wake-up and sleep.
   * @param mode The animation mode to be set.
   * @group Commands related to device
   */
  async cmdSetAnimationMode (mode: AnimationMode): Promise<void> {
    if (!_.isSafeInteger(mode) || !isAnimationMode(mode)) throw new TypeError('Invalid animation mode')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_ANIMATION_MODE, data: Buffer.from([mode]) }) // cmd = 1015
    await this._readRespTimeout()
  }

  /**
   * Save the settings of device to persistent storage.
   * @group Commands related to device
   */
  async cmdSaveSettings (): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SAVE_SETTINGS }) // cmd = 1013
    await this._readRespTimeout()
  }

  /**
   * Reset the settings of device to default values.
   * @group Commands related to device
   */
  async cmdResetSettings (): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.RESET_SETTINGS }) // cmd = 1014
    await this._readRespTimeout()
  }

  /**
   * Get the animation mode of device while wake-up and sleep.
   * @returns The animation mode of device.
   * @group Commands related to device
   */
  async cmdGetAnimationMode (): Promise<AnimationMode> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_ANIMATION_MODE }) // cmd = 1016
    return (await this._readRespTimeout())?.data[0] as AnimationMode
  }

  /**
   * Get the git version of firmware.
   * @returns The git version of firmware.
   * @group Commands related to device
   */
  async cmdGetGitVersion (): Promise<string> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_GIT_VERSION }) // cmd = 1017
    const data = (await this._readRespTimeout())?.data
    return data.toString('utf8')
  }

  /**
   * Get the active emulation tag slot of device.
   * @returns The active slot of device.
   * @group Commands related to slot
   */
  async cmdGetActiveSlot (): Promise<Slot> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_ACTIVE_SLOT }) // cmd = 1018
    return (await this._readRespTimeout())?.data[0] as Slot
  }

  /**
   * Get the slot info of all slots.
   * @returns The slot info of all slots.
   * @group Commands related to slot
   */
  async cmdGetSlotInfo (): Promise<ReturnType<typeof ResponseDecoder.parseSlotInfo>> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_SLOT_INFO }) // cmd = 1019
    return ResponseDecoder.parseSlotInfo((await this._readRespTimeout())?.data)
  }

  /**
   * Permanently wipes Chameleon to factory settings. This will delete all your slot data and custom settings. There's no going back.
   * @group Commands related to device
   */
  async cmdWipeFds (): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.WIPE_FDS }) // cmd = 1020
    await this._readRespTimeout()
  }

  /**
   * Get enabled slots.
   * @returns Enabled slots.
   * @group Commands related to slot
   */
  async cmdGetEnabledSlots (): Promise<Buffer> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_ENABLED_SLOTS }) // cmd = 1023
    return (await this._readRespTimeout())?.data
  }

  /**
   * Delete the emulation tag data of specified freq type in specified slot.
   * @param slot The slot to be deleted.
   * @param freq The freq type of slot.
   * @group Commands related to slot
   */
  async cmdDeleteSlotFreqType (slot: Slot, freq: FreqType): Promise<void> {
    if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('Invalid slot')
    if (!_.isSafeInteger(freq) || !isFreqType(freq)) throw new TypeError('Invalid freq')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.DELETE_SLOT_SENSE_TYPE, data: Buffer.from([slot, freq]) }) // cmd = 1024
    await this._readRespTimeout()
  }

  /**
   * Get the battery info of device.
   * @returns The battery info of device.
   * @group Commands related to device
   */
  async cmdGetBatteryInfo (): Promise<ReturnType<typeof ResponseDecoder.parseBatteryInfo>> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_BATTERY_INFO }) // cmd = 1025
    return ResponseDecoder.parseBatteryInfo((await this._readRespTimeout())?.data)
  }

  /**
   * Get the button press action of specified button.
   * @param btn The button to be get.
   * @returns The button press action of specified button.
   * @group Commands related to device
   */
  async cmdGetButtonPressAction (btn: ButtonType): Promise<ButtonAction> {
    if (!_.isString(btn) || !isButtonType(btn)) throw new TypeError('Invalid button type')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_BUTTON_PRESS_CONFIG, data: Buffer.from(btn) }) // cmd = 1026
    return (await this._readRespTimeout())?.data[0] as ButtonAction
  }

  /**
   * Set the button press action of specified button.
   * @param btn The button to be set.
   * @param action The button press action to be set.
   * @group Commands related to device
   */
  async cmdSetButtonPressAction (btn: ButtonType, action: ButtonAction): Promise<void> {
    if (!_.isString(btn) || !isButtonType(btn)) throw new TypeError('Invalid button type')
    if (!_.isSafeInteger(action) || !isButtonAction(action)) throw new TypeError('Invalid button action')
    this._clearRxBufs()
    const data = new Buffer(2)
    data.write(btn, 0)
    data[1] = action
    await this._writeCmd({ cmd: Cmd.SET_BUTTON_PRESS_CONFIG, data }) // cmd = 1027
    await this._readRespTimeout()
  }

  /**
   * Get the button long press action of specified button.
   * @param btn The button to be get.
   * @returns The button long press action of specified button.
   * @group Commands related to device
   */
  async cmdGetButtonLongPressAction (btn: ButtonType): Promise<ButtonAction> {
    if (!_.isString(btn) || !isButtonType(btn)) throw new TypeError('Invalid button type')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_LONG_BUTTON_PRESS_CONFIG, data: Buffer.from(btn) }) // cmd = 1028
    return (await this._readRespTimeout())?.data[0] as ButtonAction
  }

  /**
   * Set the button long press action of specified button.
   * @param btn The button to be set.
   * @param action The button long press action to be set.
   * @group Commands related to device
   */
  async cmdSetButtonLongPressAction (btn: ButtonType, action: ButtonAction): Promise<void> {
    if (!_.isString(btn) || !isButtonType(btn)) throw new TypeError('Invalid button type')
    if (!_.isSafeInteger(action) || !isButtonAction(action)) throw new TypeError('Invalid button action')
    this._clearRxBufs()
    const data = new Buffer(2)
    data.write(btn, 0)
    data[1] = action
    await this._writeCmd({ cmd: Cmd.SET_LONG_BUTTON_PRESS_CONFIG, data }) // cmd = 1029
    await this._readRespTimeout()
  }

  /**
   * Set the ble pairing key of device.
   * @param key The new ble pairing key.
   * @group Commands related to device
   */
  async cmdBleSetPairingKey (key: string): Promise<void> {
    if (!_.isString(key) || !/^\d{6}$/.test(key)) throw new TypeError('Invalid key, must be 6 digits')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_BLE_PAIRING_KEY, data: Buffer.from(key) }) // cmd = 1030
    await this._readRespTimeout()
  }

  /**
   * Get current ble pairing key of device.
   * @returns The ble pairing key.
   * @group Commands related to device
   */
  async cmdBleGetPairingKey (): Promise<string> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_BLE_PAIRING_KEY }) // cmd = 1031
    return (await this._readRespTimeout())?.data.toString('utf8')
  }

  /**
   * Delete all ble bindings.
   * @group Commands related to device
   */
  async cmdBleDeleteAllBonds (): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.DELETE_ALL_BLE_BONDS }) // cmd = 1032
    await this._readRespTimeout()
  }

  /**
   * Get the device is ChameleonUltra or ChameleonLite.
   * @returns `true` if device is ChameleonUltra, `false` if device is ChameleonLite.
   * @group Commands related to device
   */
  async cmdGetDeviceModel (): Promise<DeviceModel> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_DEVICE_MODEL }) // cmd = 1033
    const data = (await this._readRespTimeout())?.data
    return data[0]
  }

  /**
   * Get the settings of device.
   * @returns The settings of device.
   * @group Commands related to device
   */
  async cmdGetDeviceSettings (): Promise<ReturnType<typeof ResponseDecoder.parseDeviceSettings>> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_DEVICE_SETTINGS }) // cmd = 1034
    return ResponseDecoder.parseDeviceSettings((await this._readRespTimeout())?.data)
  }

  /**
   * Get the ble pairing mode of device.
   * @returns `true` if pairing is required to connect to device, otherwise return `false`.
   * @group Commands related to device
   */
  async cmdBleGetPairingMode (): Promise<boolean> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_BLE_PAIRING_ENABLE }) // cmd = 1036
    return (await this._readRespTimeout())?.data[0] === 1
  }

  /**
   * Set if the ble pairing is required when connecting to device.
   * @param enable `true` to enable pairing mode, `false` to disable pairing mode.
   * @group Commands related to device
   */
  async cmdBleSetPairingMode (enable: boolean): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_BLE_PAIRING_ENABLE, data: Buffer.from([enable ? 1 : 0]) }) // cmd = 1037
    await this._readRespTimeout()
  }

  /**
   * Scan 14a tag, and return basic information. The device mode must be set to READER before using this command.
   * @returns The basic infomation of scanned tag.
   * @throws This command will throw an error if tag not scanned or any error occured.
   * @group Commands related to device mode: READER
   */
  async cmdHf14aScan (): Promise<ReturnType<typeof ResponseDecoder.parseHf14aTag>> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.HF14A_SCAN }) // cmd = 2000
    return ResponseDecoder.parseHf14aTag((await this._readRespTimeout())?.data)
  }

  /**
   * Check if the tag support mifare protocol.
   * @returns `true` if device support mf1, otherwise return `false`.
   * @group Commands related to device mode: READER
   */
  async cmdMf1IsSupport (): Promise<boolean> {
    try {
      this._clearRxBufs()
      await this._writeCmd({ cmd: Cmd.MF1_DETECT_SUPPORT }) // cmd = 2001
      await this._readRespTimeout()
      return true
    } catch (err) {
      if (err.status === RespStatus.HF_ERRSTAT) return false
      throw err
    }
  }

  /**
   * Check the nt level of mifare protocol.
   * @returns The nt level of mifare protocol.
   * @group Commands related to device mode: READER
   */
  async cmdMf1TestNtLevel (): Promise<Mf1NtLevel> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_DETECT_NT_LEVEL }) // cmd = 2002
    const status = (await this._readRespTimeout())?.status
    const statusToString: Record<number, Mf1NtLevel> = {
      0x00: 'weak',
      0x24: 'static',
      0x25: 'hard',
    }
    return statusToString[status] ?? 'unknown'
  }

  /**
   * Check if the tag is suffer from mifare darkside attack.
   * @returns The detect result of mifare darkside attack.
   * @group Commands related to device mode: READER
   * @alpha
   */
  async cmdMf1TestDarkside (): Promise<boolean> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_DETECT_DARKSIDE }) // cmd = 2003
    const status = (await this._readRespTimeout({ timeout: 6e4 }))?.status
    return status === RespStatus.HF_TAG_OK
  }

  /**
   * Acquire the data from mifare darkside attack.
   * @param block The target block.
   * @param keyType The target key type.
   * @param isFirst `true` if this is the first attack.
   * @param syncMax The max sync count of darkside attack.
   * @returns The data from mifare darkside attack.
   * @group Commands related to device mode: READER
   * @alpha
   */
  async cmdMf1AcquireDarkside (block = 0, keyType = Mf1KeyType.KEY_A, isFirst = false, syncMax = 15): Promise<ReturnType<typeof ResponseDecoder.parseMf1DarksideCore>> {
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.MF1_DARKSIDE_ACQUIRE, // cmd = 2004
      data: Buffer.from([keyType, block, isFirst ? 1 : 0, syncMax]),
    })
    return ResponseDecoder.parseMf1DarksideCore((await this._readRespTimeout({ timeout: (syncMax + 5) * 1000 }))?.data)
  }

  /**
   * Dectect the nt distance of mifare protocol.
   * @param args
   * @returns The nt distance of mifare protocol.
   * @group Commands related to device mode: READER
   * @alpha
   */
  async cmdMf1TestNtDistance ({ src: { srcBlock = 0, srcKeyType = Mf1KeyType.KEY_A, srcKey = Buffer.from('FFFFFFFFFFFF', 'hex') } }: CmdTestMf1NtDistanceArgs): Promise<ReturnType<typeof ResponseDecoder.parseMf1NtDistance>> {
    if (!Buffer.isBuffer(srcKey) || srcKey.length !== 6) throw new TypeError('srcKey should be a Buffer with length 6')
    if (!_.isSafeInteger(srcKeyType) || !isMf1KeyType(srcKeyType)) throw new TypeError('Invalid srcKeyType')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.MF1_DETECT_NT_DIST, // cmd = 2005
      data: Buffer.concat([Buffer.from([srcKeyType, srcBlock]), srcKey]),
    })
    return ResponseDecoder.parseMf1NtDistance((await this._readRespTimeout())?.data)
  }

  /**
   * Acquire the data from mifare nested attack.
   * @param args
   * @returns The data from mifare nested attack.
   * @group Commands related to device mode: READER
   * @alpha
   */
  async cmdMf1AcquireNested ({
    src: { srcBlock = 0, srcKeyType = Mf1KeyType.KEY_A, srcKey = Buffer.from('FFFFFFFFFFFF', 'hex') },
    dst: { dstBlock = 0, dstKeyType = Mf1KeyType.KEY_A },
  }: CmdAcquireMf1NestedArgs): Promise<ReturnType<typeof ResponseDecoder.parseMf1NestedCore>> {
    if (!Buffer.isBuffer(srcKey) || srcKey.length !== 6) throw new TypeError('srcKey should be a Buffer with length 6')
    if (!_.isSafeInteger(srcKeyType) || !isMf1KeyType(srcKeyType)) throw new TypeError('Invalid srcKeyType')
    if (!_.isSafeInteger(dstKeyType) || !isMf1KeyType(dstKeyType)) throw new TypeError('Invalid dstKeyType')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.MF1_NESTED_ACQUIRE, // cmd = 2006
      data: Buffer.concat([Buffer.from([srcKeyType, srcBlock]), srcKey, Buffer.from([dstKeyType, dstBlock])]),
    })
    return ResponseDecoder.parseMf1NestedCore((await this._readRespTimeout())?.data)
  }

  /**
   * Check if the key is valid for specified block and key type.
   * @param args
   * @returns `true` if the key is valid for specified block and key type.
   * @group Commands related to device mode: READER
   */
  async cmdMf1CheckBlockKey ({ block = 0, keyType = Mf1KeyType.KEY_A, key = Buffer.from('FFFFFFFFFFFF', 'hex') }: CmdCheckMf1BlockKeyArgs = {}): Promise<boolean> {
    try {
      if (!_.isSafeInteger(keyType) || !isMf1KeyType(keyType)) throw new TypeError('Invalid keyType')
      if (!Buffer.isBuffer(key) || key.length !== 6) throw new TypeError('key should be a Buffer with length 6')
      this._clearRxBufs()
      await this._writeCmd({
        cmd: Cmd.MF1_AUTH_ONE_KEY_BLOCK, // cmd = 2007
        data: Buffer.concat([Buffer.from([keyType, block]), key]),
      })
      await this._readRespTimeout()
      return true
    } catch (err) {
      if (err.status === RespStatus.MF_ERRAUTH) return false
      throw err
    }
  }

  /**
   * Read data from specified block.
   * @param args
   * @returns The data read from specified block.
   * @group Commands related to device mode: READER
   */
  async cmdMf1ReadBlock ({ block = 0, keyType = Mf1KeyType.KEY_A, key = Buffer.from('FFFFFFFFFFFF', 'hex') }: CmdReadMf1BlockArgs = {}): Promise<Buffer> {
    if (!Buffer.isBuffer(key) || key.length !== 6) throw new TypeError('key should be a Buffer with length 6')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.MF1_READ_ONE_BLOCK, // cmd = 2008
      data: Buffer.concat([Buffer.from([keyType, block]), key]),
    })
    return (await this._readRespTimeout())?.data
  }

  /**
   * Write data to specified block.
   * @param args
   * @group Commands related to device mode: READER
   */
  async cmdMf1WriteBlock ({ block = 0, keyType = Mf1KeyType.KEY_A, key = Buffer.from('FFFFFFFFFFFF', 'hex'), data }: CmdWriteMf1BlockArgs = {}): Promise<void> {
    if (!Buffer.isBuffer(key) || key.length !== 6) throw new TypeError('key should be a Buffer with length 6')
    if (!Buffer.isBuffer(data) || data.length !== 16) throw new TypeError('data should be a Buffer with length 16')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.MF1_WRITE_ONE_BLOCK, // cmd = 2009
      data: Buffer.concat([Buffer.from([keyType, block]), key, data]),
    })
    await this._readRespTimeout()
  }

  /**
   * Get the info composed of `cmdHf14aScan()` and `cmdMf1TestNtLevel()`.
   * @returns The info about 14a tag and mifare protocol.
   * @group Commands related to device mode: READER
   */
  async hf14aInfo (): Promise<Hf14aInfoResp> {
    if (await this.cmdGetDeviceMode() !== DeviceMode.READER) await this.cmdChangeDeviceMode(DeviceMode.READER)
    const resp: Hf14aInfoResp = {
      tag: await this.cmdHf14aScan(),
    }
    if (await this.cmdMf1IsSupport()) {
      resp.mifare = {
        prngAttack: await this.cmdMf1TestNtLevel(),
      }
    }
    return resp
  }

  /**
   * Scan em410x tag and print id
   * @returns The id of em410x tag.
   * @group Commands related to device mode: READER
   */
  async cmdEm410xScan (): Promise<Buffer> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.EM410X_SCAN }) // cmd = 3000
    return (await this._readRespTimeout())?.data
  }

  /**
   * Write id of em410x tag to t55xx tag.
   * @param id The id of em410x tag.
   * @group Commands related to device mode: READER
   */
  async cmdEm410xWriteToT55xx (id: Buffer): Promise<void> {
    if (!Buffer.isBuffer(id) || id.length !== 5) throw new TypeError('id should be a Buffer with length 5')
    this._clearRxBufs()
    const data = new Buffer(17)
    id.copy(data, 0)
    data.writeUInt32BE(0x20206666, 5) // new key
    data.writeUInt32BE(0x51243648, 9) // old key 1
    data.writeUInt32BE(0x19920427, 13) // old key 2
    await this._writeCmd({ cmd: Cmd.EM410X_WRITE_TO_T55XX, data }) // cmd = 3001
    await this._readRespTimeout()
  }

  /**
   * Set the mifare block data of emulator.
   * @param blockStart The start block of emulator.
   * @param data The data to be set. the length of data should be multiples of 16.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1WriteEmuBlock (blockStart: number = 0, data: Buffer): Promise<void> {
    if (!Buffer.isBuffer(data) || data.length % 16 !== 0) throw new TypeError('data should be a Buffer with length be multiples of 16')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.MF1_WRITE_EMU_BLOCK_DATA, // cmd = 4000
      data: Buffer.concat([Buffer.from([blockStart]), data]),
    })
    await this._readRespTimeout()
  }

  /**
   * Set the mifare anti-collision data of emulator.
   * @param args
   * @group Commands related to device mode: TAG
   */
  async cmdHf14aSetAntiCollData ({ sak, atqa, uid }: EmuMf1AntiColl): Promise<void> {
    if (!Buffer.isBuffer(sak) || sak.length !== 1) throw new TypeError('sak should be a Buffer with length 1')
    if (!Buffer.isBuffer(atqa) || atqa.length !== 2) throw new TypeError('atqa should be a Buffer with length 2')
    if (!Buffer.isBuffer(uid) || !_.includes([4, 7, 10], uid.length)) throw new TypeError('uid should be a Buffer with length 4, 7 or 10')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.HF14A_SET_ANTI_COLL_DATA, // cmd = 4001
      data: Buffer.concat([sak, atqa, uid]),
    })
    await this._readRespTimeout()
  }

  /**
   * Enable or disable the mifare MFKey32 detection and clear the data of detections.
   * @param enable `true` to enable the detection, `false` to disable the detection.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1SetDetectionEnable (enable: boolean = true): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_SET_DETECTION_ENABLE, data: Buffer.from([enable ? 1 : 0]) }) // cmd = 4004
    await this._readRespTimeout()
  }

  /**
   * Get the count of mifare MFKey32 detections.
   * @returns The count of mifare MFKey32 detections.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1GetDetectionCount (): Promise<number> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_GET_DETECTION_COUNT }) // cmd = 4005
    return (await this._readRespTimeout())?.data.readUInt32LE()
  }

  /**
   * Get the data of mifare MFKey32 detections.
   * @param index The start index of detections to be get.
   * @returns The mifare MFKey32 detections.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1GetDetectionLogs (index: number = 0): Promise<Array<ReturnType<typeof ResponseDecoder.parseMf1Detection>>> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_GET_DETECTION_LOG, data: new Buffer(4).writeUInt32BE(index) }) // cmd = 4006
    const data = (await this._readRespTimeout())?.data
    return _.map(data.chunk(18), ResponseDecoder.parseMf1Detection)
  }

  /**
   * Get the mifare block data of emulator.
   * @param blockStart The start block of emulator.
   * @param blockCount The count of blocks to be get.
   * @returns The mifare block data of emulator.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1ReadEmuBlock (blockStart: number = 0, blockCount: number = 1): Promise<Buffer> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_READ_EMU_BLOCK_DATA, data: new Buffer([blockStart, blockCount]) }) // cmd = 4008
    return (await this._readRespTimeout())?.data
  }

  /**
   * Get the mifare config of emulator.
   * @returns The mifare config of emulator.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1GetEmuConfig (): Promise<ReturnType<typeof ResponseDecoder.parseEmuMf1Config>> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_GET_EMULATOR_CONFIG }) // cmd = 4009
    return ResponseDecoder.parseEmuMf1Config((await this._readRespTimeout())?.data)
  }

  /**
   * Set the mifare gen1a mode of emulator.
   * @param config The mifare config of emulator.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1GetGen1aMode (): Promise<boolean> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_GET_GEN1A_MODE }) // cmd = 4010
    return (await this._readRespTimeout())?.data[0] === 1
  }

  /**
   * Set the mifare gen1a mode of emulator.
   * @param enable `true` to enable the gen1a mode, `false` to disable the gen1a mode.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1SetGen1aMode (enable: boolean = false): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_SET_GEN1A_MODE, data: Buffer.from([enable ? 1 : 0]) }) // cmd = 4011
    await this._readRespTimeout()
  }

  /**
   * Get the mifare gen2 mode of emulator.
   * @returns The mifare gen2 mode of emulator.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1GetGen2Mode (): Promise<boolean> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_GET_GEN2_MODE }) // cmd = 4012
    return (await this._readRespTimeout())?.data[0] === 1
  }

  /**
   * Set the mifare gen2 mode of emulator.
   * @param enable `true` to enable the gen2 mode, `false` to disable the gen2 mode.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1SetGen2Mode (enable: boolean = false): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_SET_GEN2_MODE, data: Buffer.from([enable ? 1 : 0]) }) // cmd = 4013
    await this._readRespTimeout()
  }

  /**
   * Get the mode of emulator that using anti-collision data from block 0 for 4 byte UID tags.
   * @returns The mode of emulator that using anti-collision data from block 0 for 4 byte UID tags.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1GetBlockAntiCollMode (): Promise<boolean> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.HF14A_GET_BLOCK_ANTI_COLL_MODE }) // cmd = 4014
    return (await this._readRespTimeout())?.data[0] === 1
  }

  /**
   * Set the mode of emulator that using anti-collision data from block 0 for 4 byte UID tags.
   * @param enable `true` to enable the mode, `false` to disable the mode.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1SetBlockAntiCollMode (enable: boolean = false): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.HF14A_SET_BLOCK_ANTI_COLL_MODE, data: Buffer.from([enable ? 1 : 0]) }) // cmd = 4015
    await this._readRespTimeout()
  }

  /**
   * Get the mifare write mode of emulator.
   * @returns The mifare write mode of emulator.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1GetWriteMode (): Promise<EmuMf1WriteMode> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_GET_WRITE_MODE }) // cmd = 4016
    return (await this._readRespTimeout())?.data[0] as EmuMf1WriteMode
  }

  /**
   * Set the mifare write mode of emulator.
   * @param mode The mifare write mode of emulator.
   * @group Commands related to device mode: TAG
   */
  async cmdMf1SetWriteMode (mode: EmuMf1WriteMode): Promise<void> {
    if (!_.isSafeInteger(mode) || !isEmuMf1WriteMode(mode)) throw new TypeError('Invalid emu write mode')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_SET_WRITE_MODE, data: Buffer.from([mode]) }) // cmd = 4017
    await this._readRespTimeout()
  }

  /**
   * Get the mifare anti-collision data of emulator.
   * @returns The mifare anti-collision data of emulator.
   * @group Commands related to device mode: TAG
   */
  async cmdHf14aGetAntiCollData (): Promise<EmuMf1AntiColl> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.HF14A_GET_ANTI_COLL_DATA }) // cmd = 4018
    return ResponseDecoder.parseEmuMf1AntiColl((await this._readRespTimeout())?.data)
  }

  /**
   * Set the em410x id of emulator.
   * @param id The em410x id of emulator.
   * @group Commands related to device mode: TAG
   */
  async cmdEm410xSetEmuId (id: Buffer): Promise<void> {
    if (!Buffer.isBuffer(id) || id.length !== 5) throw new TypeError('id should be a Buffer with length 5')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.EM410X_SET_EMU_ID, data: id }) // cmd = 5000
    await this._readRespTimeout()
  }

  /**
   * Get the em410x id of emulator.
   * @returns The em410x id of emulator.
   * @group Commands related to device mode: TAG
   */
  async cmdEm410xGetEmuId (): Promise<Buffer> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.EM410X_GET_EMU_ID }) // cmd = 5001
    return (await this._readRespTimeout())?.data
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
export interface WriteCmdArgs {
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
  MF1_DETECT_DARKSIDE = 2003,
  MF1_DARKSIDE_ACQUIRE = 2004,
  MF1_DETECT_NT_DIST = 2005,
  MF1_NESTED_ACQUIRE = 2006,
  MF1_AUTH_ONE_KEY_BLOCK = 2007,
  MF1_READ_ONE_BLOCK = 2008,
  MF1_WRITE_ONE_BLOCK = 2009,

  EM410X_SCAN = 3000,
  EM410X_WRITE_TO_T55XX = 3001,

  MF1_WRITE_EMU_BLOCK_DATA = 4000,
  HF14A_SET_ANTI_COLL_DATA = 4001,
  MF1_SET_ANTI_COLLISION_INFO = 4002,
  MF1_SET_ATS_RESOURCE = 4003,
  MF1_SET_DETECTION_ENABLE = 4004,
  MF1_GET_DETECTION_COUNT = 4005,
  MF1_GET_DETECTION_LOG = 4006,

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
export const isSlot = createIsEnum(Slot)

export enum FreqType {
  NONE = 0, // 無場感應
  LF = 1, // 低頻125khz場感應
  HF = 2, // 高頻13.56mhz場感應
}
export const isFreqType = createIsEnum(FreqType)

export enum TagType {
  // 特定的且必須存在的標誌不存在的類型
  UNKNOWN = 0,
  // 125khz（ID卡）系列
  EM410X = 1,
  // Mifare系列
  MIFARE_Mini = 2,
  MIFARE_1024 = 3,
  MIFARE_2048 = 4,
  MIFARE_4096 = 5,
  // NTAG系列
  NTAG_213 = 6,
  NTAG_215 = 7,
  NTAG_216 = 8,
}
export const isTagType = createIsEnum(TagType)

export enum DeviceMode {
  TAG = 0,
  READER = 1,
}
export const isDeviceMode = createIsEnum(DeviceMode)

export enum RespStatus {
  HF_TAG_OK = 0x00, // IC卡操作成功
  HF_TAG_NOT_FOUND = 0x01, // 沒有發現IC卡
  HF_ERRSTAT = 0x02, // IC卡通訊異常
  HF_ERRCRC = 0x03, // IC卡通訊校驗異常
  HF_COLLISION = 0x04, // IC卡衝突
  HF_ERRBCC = 0x05, // IC卡BCC錯誤
  MF_ERRAUTH = 0x06, // MF卡驗證失敗
  HF_ERRPARITY = 0x07, // IC卡奇偶校驗錯誤

  DARKSIDE_CANT_FIXED_NT = 0x20, // Darkside，無法固定隨機數，這個情況可能出現在UID卡上
  DARKSIDE_LUCK_AUTH_OK = 0x21, // Darkside，直接驗證成功了，可能剛好金鑰是空的
  DARKSIDE_NACK_NO_SEND = 0x22, // Darkside，卡片不響應nack，可能是一張修復了nack邏輯漏洞的卡片
  DARKSIDE_TAG_CHANGED = 0x23, // Darkside，在運行darkside的過程中出現了卡片切換，可能訊號問題，或者真的是兩張卡迅速切換了
  NESTED_TAG_IS_STATIC = 0x24, // Nested，檢測到卡片應答的隨機數是固定的
  NESTED_TAG_IS_HARD = 0x25, // Nested，檢測到卡片應答的隨機數是不可預測的

  LF_TAG_OK = 0x40, // 低頻卡的一些操作成功！
  LF_TAG_NOT_FOUND = 0x41, // 無法搜尋到有效的EM410X標籤

  PAR_ERR = 0x60, // BLE指令傳遞的參數錯誤，或者是呼叫某些函數傳遞的參數錯誤
  DEVICE_MODE_ERROR = 0x66, // 當前裝置所處的模式錯誤，無法呼叫對應的API
  INVALID_CMD = 0x67, // 無效的指令
  DEVICE_SUCCESS = 0x68, // 裝置相關操作成功執行
  NOT_IMPLEMENTED = 0x69, // 呼叫了某些未實現的操作，屬於開發者遺漏的錯誤
  FLASH_WRITE_FAIL = 0x70, // flash寫入失敗
  FLASH_READ_FAIL = 0x71, // flash讀取失敗
}

export const RespStatusMsg = new Map([
  [RespStatus.HF_TAG_OK, 'HF tag operation succeeded'],
  [RespStatus.HF_TAG_NOT_FOUND, 'HF tag not found or lost'],
  [RespStatus.HF_ERRSTAT, 'HF tag status error'],
  [RespStatus.HF_ERRCRC, 'HF tag data crc error'],
  [RespStatus.HF_COLLISION, 'HF tag collision'],
  [RespStatus.HF_ERRBCC, 'HF tag uid bcc error'],
  [RespStatus.MF_ERRAUTH, 'HF tag auth fail'],
  [RespStatus.HF_ERRPARITY, 'HF tag data parity error'],

  [RespStatus.DARKSIDE_CANT_FIXED_NT, 'Darkside Can\'t select a nt(PRNG is unpredictable)'],
  [RespStatus.DARKSIDE_LUCK_AUTH_OK, 'Darkside try to recover a default key'],
  [RespStatus.DARKSIDE_NACK_NO_SEND, 'Darkside can\'t make tag response nack(enc)'],
  [RespStatus.DARKSIDE_TAG_CHANGED, 'Darkside running, can\'t change tag'],
  [RespStatus.NESTED_TAG_IS_STATIC, 'StaticNested tag, not weak nested'],
  [RespStatus.NESTED_TAG_IS_HARD, 'HardNested tag, not weak nested'],

  [RespStatus.LF_TAG_OK, 'LF tag operation succeeded'],
  [RespStatus.LF_TAG_NOT_FOUND, 'EM410x tag no found'],

  [RespStatus.PAR_ERR, 'API request fail, param error'],
  [RespStatus.DEVICE_MODE_ERROR, 'API request fail, device mode error'],
  [RespStatus.INVALID_CMD, 'API request fail, cmd invalid'],
  [RespStatus.DEVICE_SUCCESS, 'Device operation succeeded'],
  [RespStatus.NOT_IMPLEMENTED, 'Some api not implemented'],
  [RespStatus.FLASH_WRITE_FAIL, 'Flash write failed'],
  [RespStatus.FLASH_READ_FAIL, 'Flash read failed'],
])

export const RespStatusSuccess = new Set([
  RespStatus.DARKSIDE_LUCK_AUTH_OK,
  RespStatus.DEVICE_SUCCESS,
  RespStatus.HF_TAG_OK,
  RespStatus.LF_TAG_OK,
  RespStatus.NESTED_TAG_IS_HARD,
  RespStatus.NESTED_TAG_IS_STATIC,
])

export const RespStatusFail = new Set([
  RespStatus.HF_TAG_NOT_FOUND,
  RespStatus.HF_ERRSTAT,
  RespStatus.HF_ERRCRC,
  RespStatus.HF_COLLISION,
  RespStatus.HF_ERRBCC,
  RespStatus.MF_ERRAUTH,
  RespStatus.HF_ERRPARITY,

  RespStatus.DARKSIDE_CANT_FIXED_NT,
  RespStatus.DARKSIDE_NACK_NO_SEND,
  RespStatus.DARKSIDE_TAG_CHANGED,
  RespStatus.NESTED_TAG_IS_STATIC,
  RespStatus.NESTED_TAG_IS_HARD,

  RespStatus.LF_TAG_NOT_FOUND,

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
  DISABLE = 0,
  CYCLE_SLOT_INC = 1,
  CYCLE_SLOT_DEC = 2,
  CLONE_IC_UID = 3,
}
export const isButtonAction = createIsEnum(ButtonAction)

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
export interface PluginInstallContext {
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
      buf.readUInt16LE(6) > 0 ? buf.slice(9, -1).toString('hex') : '(no data)', // data
      buf.slice(-1).toString('hex'), // data lrc
    ].join(' ')
  }

  get cmd (): Cmd { return this.buf.readUInt16BE(2) }
  get data (): Buffer { return this.buf.subarray(9, -1) }
  get inspect (): string { return ChameleonUltraFrame.inspect(this.buf) }
  get status (): number { return this.buf.readUInt16BE(4) }
}

export type Mf1NtLevel = 'static' | 'weak' | 'hard' | 'unknown'

export enum Mf1KeyType {
  KEY_A = 0x60,
  KEY_B = 0x61,
}
export const isMf1KeyType = createIsEnum(Mf1KeyType)

export interface CmdReadMf1BlockArgs {
  block?: number
  keyType?: Mf1KeyType
  key?: Buffer
}

export interface CmdCheckMf1BlockKeyArgs {
  block?: number
  keyType?: Mf1KeyType
  key?: Buffer
}

export interface CmdWriteMf1BlockArgs {
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
  DEINED = 1,
  /** Acknowledge writes, but don't remember contents */
  DECEIVE = 2,
  /** Store data to RAM, but not save to persistent storage */
  SHADOW = 3,
}
export const isEmuMf1WriteMode = createIsEnum(EmuMf1WriteMode)

export enum AnimationMode {
  FULL = 0,
  SHORT = 1,
  NONE = 2,
}
export const isAnimationMode = createIsEnum(AnimationMode)

export interface CmdTestMf1NtDistanceArgs {
  src: {
    srcKeyType?: Mf1KeyType
    srcBlock?: number
    srcKey?: Buffer
  }
}

export interface CmdAcquireMf1NestedArgs {
  src: {
    srcKeyType?: Mf1KeyType
    srcBlock?: number
    srcKey?: Buffer
  }
  dst: {
    dstKeyType?: Mf1KeyType
    dstBlock?: number
  }
}

export { ResponseDecoder }
