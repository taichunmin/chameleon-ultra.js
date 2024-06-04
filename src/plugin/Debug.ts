import createDebugger, { type Debugger } from 'debug'
import { type ChameleonPlugin, type PluginInstallContext } from '../ChameleonUltra'

export default class ChameleonDebug implements ChameleonPlugin {
  filter?: ChameleonDebugFilter
  debugers = new Map<string, Debugger>()
  name = 'debug'

  async install (context: PluginInstallContext): Promise<this> {
    const { ultra } = context
    ultra.emitter.on('debug', (namespace: string, formatter: any, ...args: [] | any[]) => {
      if (!(this.filter?.(namespace, formatter, ...args) ?? true)) return
      const debug = this.debugers.get(namespace) ?? createDebugger(`ultra:${namespace}`)
      if (!this.debugers.has(namespace)) this.debugers.set(namespace, debug)
      debug(formatter, ...args)
    })
    return this
  }
}

;((globalThis as any ?? {}).ChameleonUltraJS ?? {}).ChameleonDebug = ChameleonDebug // eslint-disable-line @typescript-eslint/prefer-optional-chain

type ChameleonDebugFilter = (namespace: string, formatter: any, ...args: [] | any[]) => boolean
