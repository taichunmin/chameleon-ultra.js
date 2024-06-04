import _ from 'lodash'
import { ReadableStream, WritableStream, type ReadableStreamController } from 'node:stream/web'
import { type Buffer } from '@taichunmin/buffer'
import { type ChameleonPlugin, type ChameleonSerialPort, type PluginInstallContext } from '../ChameleonUltra'

const ReadableStream1: typeof ReadableStream = (globalThis as any)?.ReadableStream ?? ReadableStream
const WritableStream1: typeof WritableStream = (globalThis as any)?.WritableStream ?? WritableStream

type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}

export default class BufferMockAdapter implements ChameleonPlugin {
  name = 'adapter'
  controller?: ReadableStreamController<Buffer>
  port?: ChameleonSerialPort<Buffer, Buffer>
  recv: Buffer[] = []
  send: Buffer[] = []
  sendIdx = 0

  async install (context: AdapterInstallContext, pluginOption: any): Promise<Record<string, any>> {
    const { ultra } = context

    if (!_.isNil(ultra.$adapter)) await ultra.disconnect(new Error('adapter replaced'))
    const adapter: any = {}

    ultra.addHook('connect', async (ctx: any, next: () => Promise<unknown>) => {
      if (ultra.$adapter !== adapter) return await next() // 代表已經被其他 adapter 接管

      this.port = {
        isOpen: () => true,
        readable: new ReadableStream1({
          start: async controller => {
            this.controller = controller
          },
        }),
        writable: new WritableStream1({
          write: async chunk => {
            this.recv.push(chunk)
            if (this.sendIdx >= this.send.length) return // no more data to send
            this.controller?.enqueue(this.send[this.sendIdx++])
          },
        }),
      }

      ultra.port = this.port
      return await next()
    })

    return adapter
  }
}

;((globalThis as any ?? {}).ChameleonUltraJS ?? {}).BufferMockAdapter = BufferMockAdapter // eslint-disable-line @typescript-eslint/prefer-optional-chain
