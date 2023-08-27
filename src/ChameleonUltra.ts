import _ from 'lodash'
import { asBuffer, middlewareCompose, sleep, type MiddlewareComposeFn } from './helper'
import { Buffer } from './buffer'
import { type ReadableStream, type UnderlyingSink, WritableStream } from 'web-streams-polyfill'
import createDebugger from 'debug'

const READ_DEFAULT_TIMEOUT = 5e3
const START_OF_FRAME = Buffer.from([0x11, 0xEF])

const log = {
  core: createDebugger('ultra:core'),
}

export class ChameleonUltra {
  hooks: Record<string, MiddlewareComposeFn[]>
  plugins: Map<string, ChameleonPlugin>
  port?: ChameleonSerialPort<Buffer, Buffer>
  rxSink?: ChameleonRxSink
  supportedConfs?: Set<string>
  verboseFunc?: (text: string) => void
  versionString: string = ''

  constructor (verboseFunc?: (text: string) => void) {
    this.hooks = {}
    this.plugins = new Map()
    this.verboseFunc = verboseFunc
  }

  async use (plugin: ChameleonPlugin, option?: any): Promise<this> {
    const pluginId = `$${plugin.name}`
    const installResp = await plugin.install({
      ultra: this,
      createDebugger,
    }, option)
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
        void this.port.readable.pipeTo(new WritableStream(this.rxSink))
          .catch(err => {
            void this.disconnect()
            throw _.merge(new Error('serial.readable.pipeTo error'), { originalError: err })
          })

        // // Try to retrieve chameleons version information and supported confs
        // this.versionString = await this.cmdGetVersion()
        // this.supportedConfs = new Set(await this.getCmdSuggestions(COMMAND.CONFIG))
      } catch (err) {
        log.core(`Failed to connect: ${err.message as string}`)
        if (this.isConnected()) await this.disconnect()
        throw _.merge(new Error(err.message ?? 'Failed to connect'), { originalError: err })
      }
    })
  }

  async disconnect (): Promise<void> {
    await this.invokeHook('disconnect', {}, async (ctx, next) => {
      try {
        log.core('disconnected')
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
        const writer = this.port?.writable?.getWriter()
        if (_.isNil(writer)) throw new Error('Failed to getWriter(). Did you remember to use adapter plugin?')
        await writer.write(ctx.buf)
        writer.releaseLock()
      } catch (err) {
        throw _.merge(new Error(err.message ?? 'Failed to connect'), { originalError: err })
      }
    })
  }

  async _writeCmd ({ cmd, status = 0, data = Buffer.allocUnsafe(0) }: ChameleonUltraWriteCmdInput): Promise<void> {
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
      try {
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
          throw _.merge(new Error(RespStatusMsg.get(status)), { status, data: { resp: ctx.resp } })
        }
        return ctx.resp
      } catch (err) {
        throw _.merge(new Error(err.message ?? 'Failed read resp'), { originalError: err })
      }
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

  async scan14aTag (): Promise<Picc14aTag> {
    this._clearRxBufs()
    await this._writeCmd({ cmd: Cmd.SCAN_14A_TAG })
    return new Picc14aTag((await this._readRespTimeout())?.data)
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
}

export interface ChameleonUltraWriteCmdInput {
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

  SCAN_14A_TAG = 2000,
  MF1_SUPPORT_DETECT = 2001,
  MF1_NT_LEVEL_DETECT = 2002,
  MF1_DARKSIDE_DETECT = 2003,
  MF1_DARKSIDE_ACQUIRE = 2004,
  MF1_NT_DIST_DETECT = 2005,
  MF1_NESTED_ACQUIRE = 2006,
  MF1_CHECK_ONE_KEY_BLOCK = 2007,
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

export enum RfidFieldType {
  NONE = 0, // 無場感應
  LF = 1, // 低頻125khz場感應
  HF = 2, // 高頻13.56mhz場感應
}

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

export enum DeviceMode {
  TAG = 0,
  READER = 1,
}

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
  [RespStatus.FLASH_READ_FAIL, 'Flash read faile'],
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

export enum MifareWriteMode {
  NORMAL = 0, // Normal write
  DEINED = 1, // Send NACK to write attempts
  DECEIVE = 2, // Acknowledge writes, but don't remember contents
  SHADOW = 3, // Store data to RAM, but not to ROM
}

export enum ButtonType {
  BUTTON_A = 'A',
  BUTTON_B = 'B',
}

export enum ButtonAction {
  DISABLE = 0,
  CYCLE_SLOT_INC = 1,
  CYCLE_SLOT_DEC = 2,
  CLONE_IC_UID = 3,
}

export interface ChameleonSerialPort<I, O> {
  isOpen?: () => boolean
  readable: ReadableStream<I>
  writable: WritableStream<O>
}

export class ChameleonRxSink implements UnderlyingSink<Buffer> {
  bufs: Buffer[] = []

  write (chunk: Buffer): void {
    this.bufs.push(asBuffer(chunk))
  }
}

export interface PluginInstallContext {
  ultra: ChameleonUltra
  createDebugger: (namespace: string) => debug.Debugger
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

export class Picc14aTag {
  buf: Buffer

  constructor (buf: Buffer) {
    this.buf = buf
  }

  get uid (): Buffer {
    return this.buf.subarray(0, this.uidLen)
  }

  get uidLen (): number {
    return this.buf[10]
  }

  get cascade (): number {
    return this.buf[11]
  }

  get sak (): number {
    return this.buf[12]
  }

  get atqa (): Buffer {
    return this.buf.subarray(13, 15).reverse()
  }
}

export type Mf1PrngAttack = 'static' | 'weak' | 'hard' | 'unknown'

export interface Hf14aInfoResp {
  tag: Picc14aTag
  mifare?: {
    prngAttack: Mf1PrngAttack
  }
}
