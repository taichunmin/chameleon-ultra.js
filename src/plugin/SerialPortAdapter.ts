import _ from 'lodash'
import { Duplex } from 'stream'
import { SerialPort } from 'serialport'
import { type Buffer } from '../buffer'
import { type ChameleonPlugin, type ChameleonSerialPort, type PluginInstallContext, type Logger } from '../ChameleonUltra'

export default class SerialPortAdapter implements ChameleonPlugin {
  logger: Record<string, Logger> = {}
  name = 'adapter'
  port?: SerialPort

  async install (context: AdapterInstallContext, pluginOption: SerialPortOption): Promise<AdapterInstallResp> {
    const { ultra } = context
    this.logger.serial = ultra.createDebugger('serial')

    if (!_.isNil(ultra.$adapter)) {
      await ultra.disconnect()
    }

    const adapter: any = {}

    adapter.isSupported = (): boolean => !_.isNil(SerialPort)

    if (_.isNil(pluginOption?.baudRate)) pluginOption.baudRate = 115200

    ultra.addHook('connect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      try {
        if (adapter.isSupported() !== true) throw new Error('SerialPort not supported')

        this.port = await new Promise<SerialPort>((resolve, reject) => {
          const port1 = new SerialPort(pluginOption as any, err => { _.isNil(err) ? resolve(port1) : reject(err) })
        })
        this.port?.once('close', () => { void ultra.disconnect() })
        this.logger.serial(`port connected, path = ${pluginOption.path}, baudRate = ${pluginOption.baudRate as number}`)
        const ultraPort = Duplex.toWeb(this.port) as Partial<ChameleonSerialPort<Buffer, Buffer>>
        ultraPort.isOpen = () => { return this.port?.isOpen ?? false }
        ultra.port = ultraPort as any satisfies ChameleonSerialPort<Buffer, Buffer>
        return await next()
      } catch (err) {
        this.logger.serial(err)
        throw err
      }
    })

    ultra.addHook('disconnect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      await next()
      if (_.isNil(this.port)) return
      await new Promise<void>((resolve, reject) => { this.port?.close(err => { _.isNil(err) ? resolve() : reject(err) }) })
    })

    return adapter as AdapterInstallResp
  }
}

type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}

export interface SerialPortOption {
  path: string
  baudRate?: number
}

interface AdapterInstallResp {
  isSuppored: () => boolean
}
