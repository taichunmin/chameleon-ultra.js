import _ from 'lodash'
import { Duplex } from 'stream'
import { SerialPort } from 'serialport'
import { type Buffer } from '../buffer'
import { type ChameleonPlugin, type ChameleonSerialPort, type PluginInstallContext, type Logger } from '../ChameleonUltra'

async function findDevicePath (): Promise<string> {
  const device = _.find(await SerialPort.list(), { vendorId: '6868', productId: '8686' }) // ChameleonUltra
  if (_.isNil(device)) throw new Error('device not found')
  return device?.path
}

export default class SerialPortAdapter implements ChameleonPlugin {
  duplex?: SerialPort
  logger: Record<string, Logger> = {}
  name = 'adapter'

  async install (context: AdapterInstallContext, pluginOption: SerialPortOption = {}): Promise<AdapterInstallResp> {
    const { ultra } = context
    this.logger.serial = ultra.createDebugger('serial')

    if (!_.isNil(ultra.$adapter)) {
      await ultra.disconnect()
    }

    const adapter: any = {}

    adapter.isSupported = (): boolean => !_.isNil(SerialPort)

    ultra.addHook('connect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      try {
        if (adapter.isSupported() !== true) throw new Error('SerialPort not supported')

        const baudRate = pluginOption?.baudRate ?? 115200
        const path = pluginOption?.path ?? await findDevicePath()

        this.duplex = await new Promise<SerialPort>((resolve, reject) => {
          const tmp = new SerialPort({ baudRate, path }, err => { _.isNil(err) ? resolve(tmp) : reject(err) })
        })
        this.duplex?.once('close', () => { void ultra.disconnect() })
        this.logger.serial(`port connected, path = ${path}, baudRate = ${baudRate}`)
        const ultraPort = Duplex.toWeb(this.duplex) as unknown as Partial<ChameleonSerialPort<Buffer, Buffer>>
        ultraPort.isOpen = () => { return this.duplex?.isOpen ?? false }
        ultra.port = ultraPort as any satisfies ChameleonSerialPort<Buffer, Buffer>
        return await next()
      } catch (err) {
        this.logger.serial(err)
        throw err
      }
    })

    ultra.addHook('disconnect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter || _.isNil(this.duplex)) return await next() // 代表已經被其他 adapter 接管

      await next()
      await new Promise<void>((resolve, reject) => { this.duplex?.close(err => { _.isNil(err) ? resolve() : reject(err) }) })
      delete this.duplex
    })

    return adapter as AdapterInstallResp
  }
}

type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}

export interface SerialPortOption {
  path?: string
  baudRate?: number
}

interface AdapterInstallResp {
  isSuppored: () => boolean
}
