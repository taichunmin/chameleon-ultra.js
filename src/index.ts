export { Buffer, type Encoding } from './buffer'
export {
  ChameleonUltra,

  // enum
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

  // is enum
  isAnimationMode,
  isButtonAction,
  isButtonType,
  isDeviceMode,
  isFreqType,
  isMf1EmuWriteMode,
  isMf1KeyType,
  isMf1VblockOperator,
  isSlot,
  isTagType,
} from './ChameleonUltra'

/** The version of `chameleon-ultra.js`. */
export const version: string = '[VI]{version}[/VI]'
