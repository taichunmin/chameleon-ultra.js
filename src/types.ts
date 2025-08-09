import { type Buffer } from '@taichunmin/buffer'
import { type SetOptional } from 'type-fest'
import { type SerialPort as SerialPortPolyfill } from 'web-serial-polyfill'
import { type ChameleonUltra } from './ChameleonUltra'
import { type Hf14aAntiColl, type Mf1EmuSettings } from './decoder'
import { type HidProxFormat, type Mf1KeyType, type Mf1PrngType, type TagType } from './enums'
import { type EventEmitter } from './EventEmitter'

/** @inline @expand */
export interface AdapterInstallResp {
  isSupported: () => boolean
}

/** @inline @expand */
export interface BluetoothDataFilter<T = Buffer> {
  readonly dataPrefix?: T | undefined
  readonly mask?: T | undefined
}

/** @inline @expand */
export interface BluetoothLEScanFilter<T = Buffer> {
  readonly name?: string | undefined
  readonly namePrefix?: string | undefined
  readonly services?: BluetoothServiceUUID[] | undefined
  readonly manufacturerData?: Array<BluetoothManufacturerDataFilter<T>> | undefined
  readonly serviceData?: Array<BluetoothServiceDataFilter<T>> | undefined
}

/** @inline @expand */
export interface BluetoothManufacturerDataFilter<T = Buffer> extends BluetoothDataFilter<T> {
  companyIdentifier: number
}

/** @inline @expand */
export interface BluetoothServiceDataFilter<T = Buffer> extends BluetoothDataFilter<T> {
  service: BluetoothServiceUUID
}

/** @inline @expand */
export type BluetoothServiceUUID = number | string

/** @inline @expand */
export type DebugFilter = (namespace: string, formatter: any, ...args: [] | any[]) => boolean

/** @inline @expand */
export interface DfuImage {
  type: DfuImageType
  header: Buffer
  body: Buffer
}

/** @inline @expand */
export type DfuImageType = 'application' | 'softdevice' | 'bootloader' | 'softdevice_bootloader'

/** @inline @expand */
export type DfuManifest = Record<DfuImageType, { bin_file: string, dat_file: string }>

/** @inline @expand */
export interface EnumLike {
  [k: string]: string | number
  [nu: number]: string
}

/** @inline @expand */
export interface Hf14aTagInfo {
  antiColl: Hf14aAntiColl
  nxpTypeBySak?: string
  prngType?: Mf1PrngType
}

/** @inline @expand */
export interface HidProxTag {
  /** The format of HID Prox tag. */
  format: HidProxFormat
  /** The facility code of HID Prox tag. */
  fc: number
  /** The card number of HID Prox tag. */
  cn: number
  /** The issue level of HID Prox tag. */
  il: number
  /** The OEM code of HID Prox tag. */
  oem: number
}

/** @inline @expand */
export interface Mf1DumpFromPm3JsonResp {
  atqa: Buffer
  ats: Buffer
  body: Buffer
  sak: Buffer
  sig: Buffer
  tagType: TagType
  uid: Buffer
}

/** @inline @expand */
export interface Mf1DumpToPm3JsonResp {
  blocks: Record<number, string>
  Card: { ATQA: string, ATS?: string, SAK: string, UID: string, SIGNATURE: string }
  Created: string
  FileType: string
}

/** @inline @expand */
export interface Mf1EmuData {
  antiColl: Hf14aAntiColl
  settings: Mf1EmuSettings
  body: Buffer
}

/** @inline @expand */
export interface Mf1AcquireStaticEncryptedNestedRes {
  uid: number
  atks: Array<{
    sector: number
    keyType: Mf1KeyType
    nt: number
    ntEnc: number
    par: number
  }>
}

/** @inline @expand */
export interface Mf1KnownBlockKey {
  /** The block number of the MIFARE Classic block. */
  block: number
  /** The key of the MIFARE Classic block. */
  key: Buffer
  /** The key type of the MIFARE Classic block. */
  keyType: Mf1KeyType
}

/** @inline @expand */
export type OptionalHidProxTag = SetOptional<HidProxTag, 'format' | 'fc' | 'il' | 'oem'>

/** @inline @expand */
export type PartialRecord<K extends keyof any, T> = Partial<Record<K, T>>

/** @inline @expand */
export interface PluginInstallContext {
  Buffer: typeof Buffer
  ultra: ChameleonUltra
}

/** @inline @expand */
export interface RecoverContextUint32Array {
  s: number
  d: Uint32Array
}

/** @inline @expand */
export type SerialPort = SerialPortPolyfill & EventEmitter

/** @inline @expand */
export interface SerialPortOption {
  path?: string
  baudRate?: number
}

/** @inline @expand */
export interface SlotSettings {
  config: { activated: number }
  group: Array<{
    hfIsEnable: boolean
    hfTagType: TagType
    lfIsEnable: boolean
    lfTagType: TagType
  }>
}

/** @inline @expand */
export type UInt32Like = Buffer | number | string

/** @inline @expand */
export interface UltraPlugin {
  name: string
  install: <T extends PluginInstallContext>(context: T, pluginOption: any) => Promise<unknown>
}

/** @inline @expand */
export interface UltraSerialPort<I extends Buffer = Buffer, O extends Buffer = Buffer> {
  dfuWriteObject?: (buf: Buffer, mtu?: number) => Promise<void>
  isDfu?: () => boolean
  isOpen?: () => boolean
  readable: ReadableStream<I> | null
  writable: WritableStream<O> | null
}
