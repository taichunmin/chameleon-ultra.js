import { ChameleonUltra } from '../ChameleonUltra'
import ChameleonDebug from '../plugin/Debug'
import SerialPortAdapter from '../plugin/SerialPortAdapter'

async function main (): Promise<void> {
  const ultra = new ChameleonUltra()
  await ultra.use(new ChameleonDebug())
  await ultra.use(new SerialPortAdapter())

  console.log(`version: ${await ultra.cmdGetAppVersion()} (${await ultra.cmdGetGitVersion()})`)
  process.exit(0)
}

// run `serialport-list -f jsonline` to list port, see https://serialport.io/docs/bin-list
// ts-node src/example/serialport.js
main().catch(err => {
  console.error(err)
  process.exit(1)
})
