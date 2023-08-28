import _ from 'lodash'
import { Buffer } from './buffer'
import { createIsEnum, middlewareCompose, sleep, type MiddlewareComposeFn } from './helper'
import { debug as createDebugger, type Debugger } from 'debug'
import { type ReadableStream, type UnderlyingSink, WritableStream } from 'web-streams-polyfill'

const READ_DEFAULT_TIMEOUT = 5e3
const START_OF_FRAME = new Buffer(2).writeUInt16BE(0x11EF)

export class ChameleonUltra {
  debug: boolean
  hooks: Record<string, MiddlewareComposeFn[]>
  logger: Record<string, Logger> = {}
  plugins: Map<string, ChameleonPlugin>
  port?: ChameleonSerialPort<Buffer, Buffer>
  rxSink?: ChameleonRxSink
  versionString: string = ''

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

  createDebugger (name: string): Logger {
    if (!this.debug) return (...args: any[]) => {}
    return createDebugger(`ultra:${name}`)
  }

  async use (plugin: ChameleonPlugin, option?: any): Promise<this> {
    const pluginId = `$${plugin.name}`
    const installResp = await plugin.install({ Buffer, ultra: this }, option)
    if (!_.isNil(installResp)) (this as Record<string, any>)[pluginId] = installResp
    return this
  }

  addHook (hook: string, fn: MiddlewareComposeFn): this {
    if (!_.isArray(this.hooks[hook])) this.hooks[hook] = []
    this.hooks[hook].push(fn)
    return this
  }

  async invokeHook (hook: string, ctx: any = {}, next: MiddlewareComposeFn): Promise<unknown> {
    ctx.me = this
    return await middlewareCompose(this.hooks[hook] ?? [])(ctx, next)
  }

  async connect (): Promise<void> {
    await this.invokeHook('connect', {}, async (ctx, next) => {
      try {
        if (_.isNil(this.port)) throw new Error('this.port is undefined. Did you remember to use adapter plugin?')

        // serial.readable pipeTo this.rxSink
        this.rxSink = new ChameleonRxSink()
        this.rxSink.writable = new WritableStream(this.rxSink)
        void this.port.readable.pipeTo(this.rxSink.writable).catch(err => {
          void this.disconnect()
          throw _.merge(new Error('serial.readable.pipeTo error'), { originalError: err })
        })

        // Try to retrieve chameleons version information and supported confs
        this.versionString = `${await this.getAppVersion()} (${await this.getGitVersion()})`
      } catch (err) {
        this.logger.core(`Failed to connect: ${err.message as string}`)
        if (this.isConnected()) await this.disconnect()
        throw _.merge(new Error(err.message ?? 'Failed to connect'), { originalError: err })
      }
    })
  }

  async disconnect (): Promise<void> {
    await this.invokeHook('disconnect', {}, async (ctx, next) => {
      try {
        await this.rxSink?.writable?.close()
        this.logger.core('disconnected')
        delete this.port
      } catch (err) {
        throw _.merge(new Error(err.message ?? 'Failed to connect'), { originalError: err })
      }
    })
  }

  isConnected (): boolean {
    return this?.port?.isOpen?.() ?? false
  }

  _calcLrc (buf: Buffer): number {
    return 0x100 - _.sum(buf) & 0xFF
  }

  async _writeBuffer (buf: Buffer): Promise<void> {
    await this.invokeHook('_writeBuffer', { buf }, async (ctx, next) => {
      try {
        if (!Buffer.isBuffer(ctx.buf)) throw new TypeError('buf should be a Buffer')
        if (!this.isConnected()) await this.connect()
        this.logger.send(frameToString(ctx.buf))
        const writer = this.port?.writable?.getWriter()
        if (_.isNil(writer)) throw new Error('Failed to getWriter(). Did you remember to use adapter plugin?')
        await writer.write(ctx.buf)
        writer.releaseLock()
      } catch (err) {
        throw _.merge(new Error(err.message ?? 'Failed to connect'), { originalError: err })
      }
    })
  }

  async _writeCmd ({ cmd, status = 0, data = Buffer.allocUnsafe(0) }: WriteCmdArgs): Promise<void> {
    const buf = Buffer.alloc(data.length + 10)
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

  _clearRxBufs (): Buffer[] {
    return this.rxSink?.bufs.splice(0, this.rxSink.bufs.length) ?? []
  }

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
        this.logger.respError(ctx.resp.buf)
        throw _.merge(new Error(RespStatusMsg.get(status)), { status, data: { resp: ctx.resp } })
      }
      this.logger.resp(frameToString(ctx.resp.buf))
      return ctx.resp
    }) as ChameleonUltraFrame
  }

  async getAppVersion (): Promise<string> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_APP_VERSION })
    const data = (await this._readRespTimeout())?.data
    return `${data[1]}.${data[0]}`
  }

  async getDeivceChipId (): Promise<string> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_DEVICE_CHIP_ID })
    const data = (await this._readRespTimeout())?.data
    return data.toString('hex')
  }

  async getDeviceAddress (): Promise<string> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_DEVICE_ADDRESS })
    const data = (await this._readRespTimeout())?.data
    const arr = []
    for (let i = data.length - 1; i >= 0; i--) arr.push(data.subarray(i, i + 1).toString('hex'))
    return _.toUpper(arr.join(':'))
  }

  async getGitVersion (): Promise<string> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_GIT_VERSION })
    const data = (await this._readRespTimeout())?.data
    return data.toString('utf8')
  }

  async getDeviceMode (): Promise<DeviceMode> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_DEVICE_MODE })
    const data = (await this._readRespTimeout())?.data
    return data[0] as DeviceMode
  }

  async setDeviceMode (mode: DeviceMode): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.CHANGE_MODE, data: Buffer.from([mode]) })
    await this._readRespTimeout()
  }

  async setSlotTagName (slot: Slot, field: RfidType, name: string): Promise<void> {
    const data = Buffer.concat([Buffer.from([slot, field]), Buffer.from(name)])
    if (!_.inRange(data.length, 3, 35)) throw new TypeError('byteLength of name should between 1 and 32')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.SET_SLOT_TAG_NICK,
      data: Buffer.concat([Buffer.from([slot, field]), Buffer.from(name)]),
    })
    await this._readRespTimeout()
  }

  async getSlotTagName (slot: Slot, field: RfidType): Promise<string | undefined> {
    try {
      if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('slot should between 0 and 7')
      if (!_.isSafeInteger(field) || !isRfidType(field) || field < 1) throw new TypeError('field should be 1 or 2')
      this._clearRxBufs()
      await this._writeCmd({ cmd: Cmd.GET_SLOT_TAG_NICK, data: Buffer.from([slot, field]) })
      return (await this._readRespTimeout())?.data.toString('utf8')
    } catch (err) {
      if (err.status === RespStatus.FLASH_READ_FAIL) return // slot name is empty
      throw err
    }
  }

  async enterBootloader (): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.ENTER_BOOTLOADER })
    await this._readRespTimeout()
  }

  async getAnimationMode (): Promise<AnimationMode> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_ANIMATION_MODE })
    return (await this._readRespTimeout())?.data[0] as AnimationMode
  }

  async setAnimationMode (mode: AnimationMode): Promise<void> {
    if (!_.isSafeInteger(mode) || !isAnimationMode(mode)) throw new TypeError('Invalid animation mode')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_ANIMATION_MODE, data: Buffer.from([mode]) })
    await this._readRespTimeout()
  }

  async saveSlotDataConfig (): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SLOT_DATA_CONFIG_SAVE })
    await this._readRespTimeout()
  }

  async getEnabledSlots (): Promise<Buffer> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_ENABLED_SLOTS })
    return (await this._readRespTimeout())?.data
  }

  async settingReset (): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.RESET_SETTINGS })
    await this._readRespTimeout()
  }

  async settingSave (): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SAVE_SETTINGS })
    await this._readRespTimeout()
  }

  async factoryReset (): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.WIPE_FDS })
    await this._readRespTimeout()
  }

  async getBatteryInfo (): Promise<BatteryInfo> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_BATTERY_INFO })
    return mf1ParseBatteryInfo((await this._readRespTimeout())?.data)
  }

  async getButtonPressAction (btn: ButtonType): Promise<ButtonAction> {
    if (!_.isString(btn) || !isButtonType(btn)) throw new TypeError('Invalid button type')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_BUTTON_PRESS_CONFIG, data: Buffer.from(btn) })
    return (await this._readRespTimeout())?.data[0] as ButtonAction
  }

  async setButtonPressAction (btn: ButtonType, action: ButtonAction): Promise<void> {
    if (!_.isString(btn) || !isButtonType(btn)) throw new TypeError('Invalid button type')
    if (!_.isSafeInteger(action) || !isButtonAction(action)) throw new TypeError('Invalid button action')
    this._clearRxBufs()
    const data = new Buffer(2)
    data.write(btn, 0)
    data[1] = action
    await this._writeCmd({ cmd: Cmd.SET_BUTTON_PRESS_CONFIG, data })
    await this._readRespTimeout()
  }

  async getButtonLongPressAction (btn: ButtonType): Promise<ButtonAction> {
    if (!_.isString(btn) || !isButtonType(btn)) throw new TypeError('Invalid button type')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_LONG_BUTTON_PRESS_CONFIG, data: Buffer.from(btn) })
    return (await this._readRespTimeout())?.data[0] as ButtonAction
  }

  async setButtonLongPressAction (btn: ButtonType, action: ButtonAction): Promise<void> {
    if (!_.isString(btn) || !isButtonType(btn)) throw new TypeError('Invalid button type')
    if (!_.isSafeInteger(action) || !isButtonAction(action)) throw new TypeError('Invalid button action')
    this._clearRxBufs()
    const data = new Buffer(2)
    data.write(btn, 0)
    data[1] = action
    await this._writeCmd({ cmd: Cmd.SET_LONG_BUTTON_PRESS_CONFIG, data })
    await this._readRespTimeout()
  }

  async getSlotInfo (): Promise<SlotInfo[]> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_SLOT_INFO })
    return mf1ParseSlotInfo((await this._readRespTimeout())?.data)
  }

  async getActiveSlot (): Promise<Slot> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_ACTIVE_SLOT })
    return (await this._readRespTimeout())?.data[0] as Slot
  }

  async setActiveSlot (slot: Slot): Promise<void> {
    if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('Invalid slot')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_SLOT_ACTIVATED, data: Buffer.from([slot]) })
    await this._readRespTimeout()
  }

  async setSlotTagType (slot: Slot, tagType: TagType): Promise<void> {
    if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('Invalid slot')
    if (!_.isSafeInteger(tagType) || !isTagType(tagType)) throw new TypeError('Invalid tag type')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_SLOT_TAG_TYPE, data: Buffer.from([slot, tagType]) })
    await this._readRespTimeout()
  }

  async deleteSlotRfidField (slot: Slot, rfidType: RfidType): Promise<void> {
    if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('Invalid slot')
    if (!_.isSafeInteger(rfidType) || !isRfidType(rfidType)) throw new TypeError('Invalid rfid')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.DELETE_SLOT_SENSE_TYPE, data: Buffer.from([slot, rfidType]) })
    await this._readRespTimeout()
  }

  async resetSlotData (slot: Slot, rfidType: RfidType): Promise<void> {
    if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('Invalid slot')
    if (!_.isSafeInteger(rfidType) || !isRfidType(rfidType)) throw new TypeError('Invalid rfid')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_SLOT_DATA_DEFAULT, data: Buffer.from([slot, rfidType]) })
    await this._readRespTimeout()
  }

  async setSlotEnable (slot: Slot, enable: boolean): Promise<void> {
    if (!_.isSafeInteger(slot) || !isSlot(slot)) throw new TypeError('Invalid slot')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_SLOT_ENABLE, data: Buffer.from([slot, enable ? 1 : 0]) })
    await this._readRespTimeout()
  }

  async em410xScanTag (): Promise<Buffer> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SCAN_EM410X_TAG })
    return (await this._readRespTimeout())?.data
  }

  async em410xWriteT55xx (uid: Buffer): Promise<void> {
    if (!Buffer.isBuffer(uid) || uid.length !== 5) throw new TypeError('uid should be a Buffer with length 5')
    this._clearRxBufs()
    const data = new Buffer(17)
    uid.copy(data, 0)
    data.writeUInt32BE(0x20206666, 5) // new key
    data.writeUInt32BE(0x51243648, 9) // old key 1
    data.writeUInt32BE(0x19920427, 13) // old key 2
    await this._writeCmd({ cmd: Cmd.WRITE_EM410X_TO_T5577, data })
    await this._readRespTimeout()
  }

  async em410xEmuGetUid (): Promise<Buffer> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_EM410X_EMU_ID })
    return (await this._readRespTimeout())?.data
  }

  async em410xEmuSetUid (uid: Buffer): Promise<void> {
    if (!Buffer.isBuffer(uid) || uid.length !== 5) throw new TypeError('uid should be a Buffer with length 5')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_EM410X_EMU_ID, data: uid })
    await this._readRespTimeout()
  }

  async scan14aTag (): Promise<Picc14aTag> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SCAN_14A_TAG })
    return mf1ParsePicc14aTag((await this._readRespTimeout())?.data)
  }

  async mf1SupportDetect (): Promise<boolean> {
    try {
      this._clearRxBufs()
      await this._writeCmd({ cmd: Cmd.MF1_SUPPORT_DETECT })
      await this._readRespTimeout()
      return true
    } catch (err) {
      if (err.status === RespStatus.HF_ERRSTAT) return false
      throw err
    }
  }

  async mf1NtLevelDetect (): Promise<Mf1PrngAttack> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.MF1_NT_LEVEL_DETECT })
    const status = (await this._readRespTimeout())?.status
    const statusToString: Record<number, Mf1PrngAttack> = {
      0x00: 'weak',
      0x24: 'static',
      0x25: 'hard',
    }
    return statusToString[status] ?? 'unknown'
  }

  async hf14aInfo (): Promise<Hf14aInfoResp> {
    if (await this.getDeviceMode() !== DeviceMode.READER) await this.setDeviceMode(DeviceMode.READER)
    const resp: Hf14aInfoResp = {
      tag: await this.scan14aTag(),
    }
    if (await this.mf1SupportDetect()) {
      resp.mifare = {
        prngAttack: await this.mf1NtLevelDetect(),
      }
    }
    return resp
  }

  async mf1ReadBlock ({ block = 0, keyType = Mf1KeyType.KEY_A, key = Buffer.from('FFFFFFFFFFFF', 'hex') }: Mf1ReadBlockArgs = {}): Promise<Buffer> {
    if (!Buffer.isBuffer(key) || key.length !== 6) throw new TypeError('key should be a Buffer with length 6')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.MF1_READ_ONE_BLOCK,
      data: Buffer.concat([Buffer.from([keyType, block]), key]),
    })
    return (await this._readRespTimeout())?.data
  }

  async mf1WriteBlock ({ block = 0, keyType = Mf1KeyType.KEY_A, key = Buffer.from('FFFFFFFFFFFF', 'hex'), data }: Mf1WriteBlockArgs = {}): Promise<void> {
    if (!Buffer.isBuffer(key) || key.length !== 6) throw new TypeError('key should be a Buffer with length 6')
    if (!Buffer.isBuffer(data) || data.length !== 16) throw new TypeError('data should be a Buffer with length 16')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.MF1_WRITE_ONE_BLOCK,
      data: Buffer.concat([Buffer.from([keyType, block]), key, data]),
    })
    await this._readRespTimeout()
  }

  async mf1SetDetection (enable: boolean = true): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_MF1_DETECTION_ENABLE, data: Buffer.from([enable ? 1 : 0]) })
    await this._readRespTimeout()
  }

  async mf1GetDetectionCount (): Promise<number> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_MF1_DETECTION_COUNT })
    return (await this._readRespTimeout())?.data.readUInt32LE()
  }

  async mf1GetDetectionRecords (index: number = 0): Promise<Mf1AuthLog[]> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_MF1_DETECTION_RESULT, data: new Buffer(4).writeUInt32BE(index) })
    const data = (await this._readRespTimeout())?.data
    return _.map(data.chunk(18), mf1ParseAuthLog)
  }

  async mf1EmuSetBlock (blockStart: number = 0, data: Buffer): Promise<void> {
    if (!Buffer.isBuffer(data) || data.length !== 16) throw new TypeError('data should be a Buffer with length 16')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.LOAD_MF1_EMU_BLOCK_DATA,
      data: Buffer.concat([Buffer.from([blockStart]), data]),
    })
    await this._readRespTimeout()
  }

  async mf1EmuGetBlock (blockStart: number = 0, blockCount: number = 1): Promise<Buffer> {
    this._clearRxBufs()
    const buf = new Buffer(3)
    buf.writeUInt8(blockStart)
    buf.writeUInt16LE(blockCount, 1)
    await this._writeCmd({ cmd: Cmd.READ_MF1_EMU_BLOCK_DATA, data: buf })
    return (await this._readRespTimeout())?.data
  }

  async mf1SetAntiColl ({ sak, atqa, uid }: Mf1SetAntiCollArgs): Promise<void> {
    if (!Buffer.isBuffer(sak) || sak.length !== 1) throw new TypeError('sak should be a Buffer with length 1')
    if (!Buffer.isBuffer(atqa) || atqa.length !== 2) throw new TypeError('atqa should be a Buffer with length 2')
    if (!Buffer.isBuffer(uid) || uid.length !== 4) throw new TypeError('uid should be a Buffer with length 4')
    this._clearRxBufs()
    await this._writeCmd({
      cmd: Cmd.SET_MF1_ANTI_COLLISION_RES,
      data: Buffer.concat([sak, atqa, uid]),
    })
    await this._readRespTimeout()
  }

  async mf1EmuGetConfig (): Promise<Mf1EmuConfig> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_MF1_EMULATOR_CONFIG })
    return mf1ParseEmuConfig((await this._readRespTimeout())?.data)
  }

  async mf1GetGen1aMode (): Promise<boolean> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_MF1_GEN1A_MODE })
    return (await this._readRespTimeout())?.data[0] === 1
  }

  async mf1SetGen1aMode (enable: boolean = false): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_MF1_GEN1A_MODE, data: Buffer.from([enable ? 1 : 0]) })
    await this._readRespTimeout()
  }

  async mf1GetGen2Mode (): Promise<boolean> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_MF1_GEN2_MODE })
    return (await this._readRespTimeout())?.data[0] === 1
  }

  async mf1SetGen2Mode (enable: boolean = false): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_MF1_GEN2_MODE, data: Buffer.from([enable ? 1 : 0]) })
    await this._readRespTimeout()
  }

  async mf1GetBlock0AntiCollMode (): Promise<boolean> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_MF1_USE_FIRST_BLOCK_COLL })
    return (await this._readRespTimeout())?.data[0] === 1
  }

  async mf1SetBlock0AntiCollMode (enable: boolean = false): Promise<void> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_MF1_USE_FIRST_BLOCK_COLL, data: Buffer.from([enable ? 1 : 0]) })
    await this._readRespTimeout()
  }

  async mf1GetWriteMode (): Promise<Mf1EmuWriteMode> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.GET_MF1_WRITE_MODE })
    return (await this._readRespTimeout())?.data[0] as Mf1EmuWriteMode
  }

  async mf1SetWriteMode (mode: Mf1EmuWriteMode): Promise<void> {
    if (!_.isSafeInteger(mode) || !isMf1EmuWriteMode(mode)) throw new TypeError('Invalid emu write mode')
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SET_MF1_WRITE_MODE, data: Buffer.from([mode]) })
    await this._readRespTimeout()
  }

  async mf1EmuGetCard (): Promise<Buffer> {
    return new Buffer() // TODO: need get_active_slot and get_slot_info
  }
}

export type Logger = Debugger | ((...args: any[]) => void)

export interface WriteCmdArgs {
  cmd: Cmd
  status?: number
  data?: Buffer
}

export enum Cmd {
  GET_APP_VERSION = 1000,
  CHANGE_MODE = 1001,
  GET_DEVICE_MODE = 1002,
  SET_SLOT_ACTIVATED = 1003,
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

  SCAN_14A_TAG = 2000,
  MF1_SUPPORT_DETECT = 2001,
  MF1_NT_LEVEL_DETECT = 2002,
  MF1_DARKSIDE_DETECT = 2003, // TODO: not implemented
  MF1_DARKSIDE_ACQUIRE = 2004, // TODO: not implemented
  MF1_NT_DIST_DETECT = 2005, // TODO: not implemented
  MF1_NESTED_ACQUIRE = 2006, // TODO: not implemented
  MF1_CHECK_ONE_KEY_BLOCK = 2007, // TODO: not implemented
  MF1_READ_ONE_BLOCK = 2008,
  MF1_WRITE_ONE_BLOCK = 2009,

  SCAN_EM410X_TAG = 3000,
  WRITE_EM410X_TO_T5577 = 3001,

  LOAD_MF1_EMU_BLOCK_DATA = 4000,
  SET_MF1_ANTI_COLLISION_RES = 4001,

  SET_MF1_DETECTION_ENABLE = 4004,
  GET_MF1_DETECTION_COUNT = 4005,
  GET_MF1_DETECTION_RESULT = 4006,

  READ_MF1_EMU_BLOCK_DATA = 4008,

  GET_MF1_EMULATOR_CONFIG = 4009,
  GET_MF1_GEN1A_MODE = 4010,
  SET_MF1_GEN1A_MODE = 4011,
  GET_MF1_GEN2_MODE = 4012,
  SET_MF1_GEN2_MODE = 4013,
  GET_MF1_USE_FIRST_BLOCK_COLL = 4014,
  SET_MF1_USE_FIRST_BLOCK_COLL = 4015,
  GET_MF1_WRITE_MODE = 4016,
  SET_MF1_WRITE_MODE = 4017,

  SET_EM410X_EMU_ID = 5000,
  GET_EM410X_EMU_ID = 5001,
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

export enum RfidType {
  NONE = 0, // 無場感應
  LF = 1, // 低頻125khz場感應
  HF = 2, // 高頻13.56mhz場感應
}
export const isRfidType = createIsEnum(RfidType)

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

export class ChameleonRxSink implements UnderlyingSink<Buffer> {
  bufs: Buffer[] = []
  writable?: WritableStream<Buffer>

  write (chunk: Buffer): void {
    this.bufs.push(Buffer.from(chunk))
  }
}

export interface PluginInstallContext {
  Buffer: typeof Buffer
  ultra: ChameleonUltra
}

export interface ChameleonPlugin {
  name: string
  install: <T extends PluginInstallContext>(context: T, pluginOption: any) => Promise<unknown>
}

export class ChameleonUltraFrame {
  buf: Buffer

  constructor (buf: Buffer) {
    this.buf = buf
  }

  get cmd (): Cmd { return this.buf.readUInt16BE(2) }
  get status (): number { return this.buf.readUInt16BE(4) }
  get data (): Buffer { return this.buf.subarray(9, -1) }
}

export interface Picc14aTag {
  uid: Buffer
  cascade: number
  sak: Buffer
  atqa: Buffer
}

export function mf1ParsePicc14aTag (buf: Buffer): Picc14aTag {
  if (!Buffer.isBuffer(buf) || buf.length !== 15) throw new TypeError('buf should be a Buffer with length 15')
  return {
    uid: buf.subarray(0, buf[10]),
    cascade: buf[11],
    sak: buf.subarray(12, 13),
    atqa: buf.subarray(13, 15),
  }
}

export type Mf1PrngAttack = 'static' | 'weak' | 'hard' | 'unknown'

export interface Hf14aInfoResp {
  tag: Picc14aTag
  mifare?: {
    prngAttack: Mf1PrngAttack
  }
}

export enum Mf1KeyType {
  KEY_A = 0x60,
  KEY_B = 0x61,
}
export const isMf1KeyType = createIsEnum(Mf1KeyType)

export interface Mf1ReadBlockArgs {
  block?: number
  keyType?: Mf1KeyType
  key?: Buffer
}

export interface Mf1WriteBlockArgs {
  block?: number
  keyType?: Mf1KeyType
  key?: Buffer
  data?: Buffer
}

export interface Mf1AuthLog {
  block: number
  isKeyB: boolean
  isNested: boolean
  uid: Buffer
  nt: Buffer
  nr: Buffer
  ar: Buffer
}

export function mf1ParseAuthLog (buf: Buffer): Mf1AuthLog {
  if (!Buffer.isBuffer(buf) || buf.length !== 18) throw new TypeError('buf should be a Buffer with length 18')
  return {
    block: buf[0],
    isKeyB: buf.subarray(1, 2).readBitLSB(0) === 1,
    isNested: buf.subarray(1, 2).readBitLSB(1) === 1,
    uid: buf.subarray(2, 6),
    nt: buf.subarray(6, 10),
    nr: buf.subarray(10, 14),
    ar: buf.subarray(14, 18),
  }
}

export interface Mf1SetAntiCollArgs {
  sak: Buffer
  atqa: Buffer
  uid: Buffer
}

export enum Mf1EmuWriteMode {
  NORMAL = 0, // Normal write
  DEINED = 1, // Send NACK to write attempts
  DECEIVE = 2, // Acknowledge writes, but don't remember contents
  SHADOW = 3, // Store data to RAM, but not to ROM
}
export const isMf1EmuWriteMode = createIsEnum(Mf1EmuWriteMode)

export interface Mf1EmuConfig {
  detection: boolean
  gen1a: boolean
  gen2: boolean
  block0AntiColl: boolean
  write: Mf1EmuWriteMode
}

export function mf1ParseEmuConfig (buf: Buffer): Mf1EmuConfig {
  if (!Buffer.isBuffer(buf) || buf.length !== 5) throw new TypeError('buf should be a Buffer with length 5')
  return {
    detection: buf[0] === 1,
    gen1a: buf[1] === 1,
    gen2: buf[2] === 1,
    block0AntiColl: buf[3] === 1,
    write: buf[4],
  }
}

export enum AnimationMode {
  FULL = 0,
  SHORT = 1,
  NONE = 2,
}
export const isAnimationMode = createIsEnum(AnimationMode)

export interface BatteryInfo {
  voltage: number
  level: number
}

export function mf1ParseBatteryInfo (buf: Buffer): BatteryInfo {
  if (!Buffer.isBuffer(buf) || buf.length !== 3) throw new TypeError('buf should be a Buffer with length 3')
  return {
    voltage: buf.readUInt16BE(0),
    level: buf[2],
  }
}

export interface SlotInfo {
  hfTagType: TagType
  lfTagType: TagType
}

export function mf1ParseSlotInfo (buf: Buffer): SlotInfo[] {
  if (!Buffer.isBuffer(buf) || buf.length !== 16) throw new TypeError('buf should be a Buffer with length 16')
  return _.times(8, i => ({
    hfTagType: buf[2 * i],
    lfTagType: buf[2 * i + 1],
  }))
}

export function frameToString (buf: any): string {
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
