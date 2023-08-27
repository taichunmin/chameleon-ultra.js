import { Buffer } from '../buffer'
import { type ChameleonPlugin, type PluginInstallContext } from '../ChameleonUltra'
import createDebugger from 'debug'

const log = {
  send: createDebugger('ultra:send'),
  resp: createDebugger('ultra:resp'),
  error: createDebugger('ultra:error'),
}

function frameToString (buf: Buffer): string {
  if (!Buffer.isBuffer(buf)) return 'Invalid frame'
  // sof + sof lrc + cmd (2) + status (2) + data len (2) + head lrc + data + data lrc
  return [
    buf.slice(0, 2).toString('hex'), // sof + sof lrc
    buf.slice(2, 4).toString('hex'), // cmd
    buf.slice(4, 6).toString('hex'), // status
    buf.slice(6, 8).toString('hex'), // data len
    buf.slice(8, 9).toString('hex'), // head lrc
    buf.readUInt16LE(6) > 0 ? buf.slice(9, -1).toString('hex') : '(no data)', // data
    buf.slice(-1).toString('hex'), // data lrc
  ].join(' ')
}

export default class LoggerRxTx implements ChameleonPlugin {
  name = 'loggerRxTx'

  async install (context: PluginInstallContext, pluginOption: any): Promise<void> {
    const { ultra } = context

    ultra.addHook('_writeBuffer', async (ctx, next) => {
      log.send(frameToString(ctx.buf))
      return await next()
    })

    ultra.addHook('_readRespTimeout', async (ctx, next) => {
      try {
        const resp = await next() as any
        log.resp(frameToString(resp.buf))
        return resp
      } catch (err) {
        if (err?.data?.resp?.length > 0) log.error(err.data.resp)
        throw err
      }
    })
  }
}
