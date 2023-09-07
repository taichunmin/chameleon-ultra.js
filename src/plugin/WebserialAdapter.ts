import _ from 'lodash'
import { serial, type SerialPort } from './WebSerialPolyfill'
import { sleep } from '../helper'
import { type ChameleonPlugin, type Logger, type PluginInstallContext } from '../ChameleonUltra'

const WEBSERIAL_FILTERS = [
  { usbVendorId: 0x6868, usbProductId: 0x8686 }, // Chameleon Tiny
]

export default class WebserialAdapter implements ChameleonPlugin {
  isOpen: boolean = false
  logger: Record<string, Logger> = {}
  name = 'adapter'
  port?: SerialPort

  async install (context: AdapterInstallContext, pluginOption: any): Promise<AdapterInstallResp> {
    const { ultra } = context
    this.logger.webserial = ultra.createDebugger('webserial')

    if (!_.isNil(ultra.$adapter)) await ultra.disconnect()
    const adapter: any = {}

    adapter.isSupported = (): boolean => !_.isNil(serial)

    ultra.addHook('connect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      try {
        if (adapter.isSupported() !== true) throw new Error('WebSerial not supported')
        this.port = await serial.requestPort({ filters: WEBSERIAL_FILTERS })
        if (_.isNil(this.port)) throw new Error('user canceled')

        // port.open
        await this.port.open({ baudRate: 115200 })
        while (_.isNil(this.port.readable) || _.isNil(this.port.writable)) await sleep(10) // wait for port.readable
        this.isOpen = true

        const info = await this.port.getInfo() as { usbVendorId: number, usbProductId: number }
        this.logger.webserial(`port selected, usbVendorId = ${info.usbVendorId}, usbProductId = ${info.usbProductId}`)
        this.port.addEventListener?.('disconnect', () => { void ultra.disconnect() })
        ultra.port = _.merge(this.port, {
          isOpen: () => { return this.isOpen },
        })
        return await next()
      } catch (err) {
        this.logger.webserial(err)
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

type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}

interface AdapterInstallResp {
  isSuppored: () => boolean
}
