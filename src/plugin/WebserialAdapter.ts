import _ from 'lodash'
import { serial, type SerialPort } from 'web-serial-polyfill'
import { sleep } from '../helper'
import { type ChameleonPlugin, type ChameleonUltra, type PluginInstallContext } from '../ChameleonUltra'
import { type EventEmitter } from '../EventEmitter'

type SerialPort1 = SerialPort & EventEmitter
const navigator = (globalThis as any)?.navigator ?? {}
const serial1: typeof serial = navigator.serial ?? ('usb' in navigator ? serial : null)

const WEBSERIAL_FILTERS = [
  { usbVendorId: 0x6868, usbProductId: 0x8686 }, // Chameleon Ultra
]

function u16ToHex (num: number): string {
  return _.toUpper(`000${num.toString(16)}`.slice(-4))
}

export default class WebserialAdapter implements ChameleonPlugin {
  isOpen: boolean = false
  name = 'adapter'
  port?: SerialPort1
  ultra?: ChameleonUltra

  #debug (formatter: any, ...args: [] | any[]): void {
    this.ultra?.emitter.emit('debug', 'webserial', formatter, ...args)
  }

  async install (context: AdapterInstallContext, pluginOption: any): Promise<AdapterInstallResp> {
    const ultra = this.ultra = context.ultra

    if (!_.isNil(ultra.$adapter)) await ultra.disconnect(new Error('adapter replaced'))
    const adapter: any = {}

    adapter.isSupported = (): boolean => !_.isNil(serial1)

    ultra.addHook('connect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      try {
        if (adapter.isSupported() !== true) throw new Error('WebSerial not supported')
        this.port = await serial1.requestPort({ filters: WEBSERIAL_FILTERS }) as SerialPort1
        if (_.isNil(this.port)) throw new Error('user canceled')

        // port.open
        await this.port.open({ baudRate: 115200 })
        while (_.isNil(this.port.readable) || _.isNil(this.port.writable)) await sleep(10) // wait for port.readable
        this.isOpen = true

        const info = await this.port.getInfo() as { usbVendorId: number, usbProductId: number }
        this.#debug(`port selected, usbVendorId = 0x${u16ToHex(info.usbVendorId)}, usbProductId = 0x${u16ToHex(info.usbProductId)}`)
        this.port.addEventListener('disconnect', () => { void ultra.disconnect(new Error('Webserial disconnect')) })
        ultra.port = _.merge(this.port, {
          isOpen: () => this.isOpen,
        })
        return await next()
      } catch (err) {
        this.#debug(err)
        throw err
      }
    })

    ultra.addHook('disconnect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter || _.isNil(this.port)) return await next() // 代表已經被其他 adapter 接管

      await next()
      await this.port.close()
      this.isOpen = false
      delete this.port
    })

    return adapter as AdapterInstallResp
  }
}

;((globalThis as any ?? {}).ChameleonUltraJS ?? {}).WebserialAdapter = WebserialAdapter // eslint-disable-line @typescript-eslint/prefer-optional-chain

type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}

interface AdapterInstallResp {
  isSuppored: () => boolean
}
