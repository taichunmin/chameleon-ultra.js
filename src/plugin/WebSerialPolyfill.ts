import { serial as serialPolyfill, type SerialPort } from 'web-serial-polyfill'

declare let window: any
export const serial = window?.navigator?.serial ?? serialPolyfill

export type { SerialPort }
