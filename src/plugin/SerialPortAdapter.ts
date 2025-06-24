import * as _ from 'lodash-es'
import { SerialPort } from 'serialport'
import { Duplex } from 'stream'
import { type ChameleonPlugin, type ChameleonUltra, type PluginInstallContext } from '../ChameleonUltra'
import { setObject } from '../iifeExportHelper'

async function findDevicePath (): Promise<string> {
  const device = _.find(await SerialPort.list(), { vendorId: '6868', productId: '8686' }) // ChameleonUltra
  if (_.isNil(device)) throw new Error('device not found')
  return device?.path
}

export default class SerialPortAdapter implements ChameleonPlugin {
  duplex: SerialPort | null = null
  name = 'adapter'
  readonly #emitErr: (err: Error) => void
  ultra?: ChameleonUltra

  constructor () {
    this.#emitErr = (err: Error): void => { this.ultra?.emitter.emit('error', _.set(new Error(err.message), 'originalError', err)) }
  }

  #debug (formatter: any, ...args: [] | any[]): void {
    this.ultra?.emitter.emit('debug', 'serial', formatter, ...args)
  }

  async install (context: AdapterInstallContext, pluginOption: SerialPortOption = {}): Promise<AdapterInstallResp> {
    const ultra = this.ultra = context.ultra

    if (!_.isNil(ultra.$adapter)) {
      await ultra.disconnect(new Error('adapter replaced'))
    }

    const adapter: AdapterInstallResp = {
      isSupported: () => !_.isNil(SerialPort),
    }

    ultra.addHook('connect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      try {
        if (!adapter.isSupported()) throw new Error('SerialPort not supported')

        const baudRate = pluginOption?.baudRate ?? 115200
        const path = pluginOption?.path ?? await findDevicePath()

        this.duplex = await new Promise<SerialPort>((resolve, reject) => {
          const tmp = new SerialPort({ baudRate, path }, err => { _.isNil(err) ? resolve(tmp) : reject(err) })
        })
        this.duplex?.once('close', () => { void ultra.disconnect(new Error('SerialPort closed')) })
        this.#debug(`port connected, path = ${path}, baudRate = ${baudRate}`)
        ultra.port = _.merge(Duplex.toWeb(this.duplex), {
          isOpen: () => { return this.duplex?.isOpen ?? false },
          isDfu: () => false, // TODO: dfu
        })
        return await next()
      } catch (err) {
        this.#debug(err)
        throw err
      }
    })

    ultra.addHook('disconnect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter || _.isNil(this.duplex)) return await next() // 代表已經被其他 adapter 接管

      await next().catch(this.#emitErr)
      await new Promise<void>((resolve, reject) => { this.duplex?.close(err => { _.isNil(err) ? resolve() : reject(err) }) })
      this.duplex = null
    })

    return adapter
  }
}

setObject(globalThis, ['ChameleonUltraJS', 'SerialPortAdapter'], SerialPortAdapter)

/** @inline */
type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}

/** @inline */
interface SerialPortOption {
  path?: string
  baudRate?: number
}

/** @inline */
interface AdapterInstallResp {
  isSupported: () => boolean
}
