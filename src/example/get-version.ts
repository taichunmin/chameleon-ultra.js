import { ChameleonUltra } from '../ChameleonUltra'
import Debug from '../plugin/Debug'
import SerialPortAdapter from '../plugin/SerialPortAdapter'

// run `serialport-list -f jsonline` to list port, see https://serialport.io/docs/bin-list
// tsx src/example/get-version.ts
main().catch(err => {
  console.error(err)
  process.exit(1)
})

async function main (): Promise<void> {
  const ultra = new ChameleonUltra()
  await ultra.use(new Debug())
  await ultra.use(new SerialPortAdapter())

  console.log(`version: ${await ultra.cmdGetAppVersion()} (${await ultra.cmdGetGitVersion()})`)
  process.exit(0)
}
