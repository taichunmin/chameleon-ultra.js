import { serial as serialPolyfill, type SerialPort as SerialPortPolyfill } from 'web-serial-polyfill'

declare let window: any
export const serial = window?.navigator?.serial ?? serialPolyfill

type SerialPort = SerialPortPolyfill & {
  addEventListener: (
    eventName: string,
    listener: (...args: any[]) => void,
    opts?: {
      once: boolean
    }
  ) => any
}

export type { SerialPort }
