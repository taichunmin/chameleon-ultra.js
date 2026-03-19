/** version of chameleon-ultra.js SDK */
export const version = process.env.VERSION ?? 'unknown'

export { Buffer } from '@taichunmin/buffer'
export { ChameleonUltra } from './ChameleonUltra'
export {
  AnimationMode,
  ButtonAction,
  ButtonType,
  Cmd,
  DarksideStatus,
  DeviceMode,
  DeviceModel,
  DfuFwId,
  DfuFwType,
  DfuObjType,
  FreqType,
  Hf14aBccMode,
  Hf14aCascadeLevelMode,
  Hf14aRatsMode,
  HidProxFormat,
  HidProxFormatName,
  Mf1EmuWriteMode,
  Mf1KeyType,
  Mf1PrngType,
  Mf1VblockOperator,
  MfuEmuWriteMode,
  MfuMaxPage,
  NxpMfuType,
  NxpMfuTypeName,
  Slot,
  TagType,
  TagTypeLfIdLen,
} from './enums'
