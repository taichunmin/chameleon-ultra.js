import _ from 'lodash'
import { ChameleonUltra } from '../ChameleonUltra'
import SerialPortAdapter from '../plugin/SerialPortAdapter'

async function main (): Promise<void> {
  const ultra = new ChameleonUltra(true)
  const path = process.env.SERIAL_PATH
  if (_.isNil(path)) throw new Error('env.SERIAL_PATH is not defined')
  console.log(`path = ${path}`)
  await ultra.use(new SerialPortAdapter(), { path })

  console.log(`version: ${await ultra.cmdGetAppVersion()} (${await ultra.cmdGetGitVersion()})`)
  process.exit(0)
}

// run `serialport-list -f jsonline` to list port, see https://serialport.io/docs/bin-list
// SERIAL_PATH='/dev/tty.usbserial-120' ts-node src/example/serialport.js
main().catch(err => {
  console.error(err)
  process.exit(1)
})
