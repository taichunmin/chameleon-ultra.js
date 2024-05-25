/** SDK version of chameleon-ultra.js */
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
  FreqType,
  Mf1EmuWriteMode,
  Mf1KeyType,
  Mf1PrngType,
  Mf1VblockOperator,
  Slot,
  TagType,
} from './enums'
