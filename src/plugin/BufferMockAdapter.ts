import { Buffer } from '@taichunmin/buffer'
import * as _ from 'lodash-es'
import { ReadableStream, WritableStream, type ReadableStreamController } from 'stream/web'
import { setObject } from '../iifeExportHelper'
import { type UltraPlugin, type UltraSerialPort, type PluginInstallContext } from '../types'

const ReadableStream1: typeof ReadableStream = (globalThis as any)?.ReadableStream ?? ReadableStream
const WritableStream1: typeof WritableStream = (globalThis as any)?.WritableStream ?? WritableStream

type AdapterInstallContext = PluginInstallContext & {
  ultra: PluginInstallContext['ultra'] & { $adapter?: any }
}

export default class BufferMockAdapter implements UltraPlugin {
  name = 'adapter'
  controller?: ReadableStreamController<Buffer>
  port?: UltraSerialPort
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
        readable: new ReadableStream1<Buffer>({
          start: async controller => {
            this.controller = controller
          },
        }),
        writable: new WritableStream1<Buffer>({
          write: async chunk => {
            this.recv.push(Buffer.isBuffer(chunk) ? chunk : Buffer.fromView(chunk))
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

setObject(globalThis, ['ChameleonUltraJS', 'BufferMockAdapter'], BufferMockAdapter)
