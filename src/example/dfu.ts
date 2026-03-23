import * as _ from 'lodash-es'
import { setTimeout as sleep } from 'node:timers/promises'
import { Buffer, ChameleonUltra } from '../index'
import Debug, { errToJson } from '../plugin/Debug'
import DfuZip from '../plugin/DfuZip'
import SerialPortAdapter from '../plugin/SerialPortAdapter'

// run `serialport-list -f jsonline` to list port, see https://serialport.io/docs/bin-list
// tsx src/example/dfu.ts
main().catch(err => {
  console.error(errToJson(_.set(new Error(err.message), 'cause', err)))
  process.exit(1)
})

async function main (): Promise<void> {
  console.log('fetching manifest...')
  const manifest = await fetchManifest()
  const latestRelease = _.maxBy(manifest.releases, r => new Date(r.createdAt).getTime())
  if (_.isNil(latestRelease)) throw new Error('no release found in manifest')
  console.log(`latest release: ${latestRelease.tagName} (${latestRelease.gitVersion ?? '?'})`)

  console.log('Downloading firmware...')
  const images = _.compact(await Promise.all(_.map(['ultra', 'lite'], async model => {
    try {
      const url = _.find(latestRelease.assets, { name: `${model}-dfu-app.zip` })?.url
      if (_.isNil(url)) throw new Error(`URL of ${model}-dfu-app.zip not found in manifest`)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to download ${model}-dfu-app.zip: ${res.status} ${res.statusText}`)
      const dfuZip = new DfuZip(Buffer.from(await res.arrayBuffer()))
      return await dfuZip.getAppImage()
    } catch (err) {
      console.error(errToJson(err))
    }
  })))

  for (let i = 0; i < 10; i++) {
    console.log(`Attempt ${i + 1}...`)
    const ultra = new ChameleonUltra()
    await ultra.use(new Debug())
    await ultra.use(new SerialPortAdapter())
    try {
      if (!ultra.isConnected()) await ultra.connect()
      if (!ultra.isDfu()) {
        try {
          const gitVersion = await ultra.cmdGetGitVersion()
          if (gitVersion === latestRelease.gitVersion) {
            console.log('Device firmware is already up to date.')
            continue
          }
          console.log('Device entered DFU mode...')
          await ultra.cmdDfuEnter()
        } catch (err) {
          console.error(errToJson(_.set(new Error(err.message), 'cause', err)))
        }
      } else {
        let isUploadSuccess = false
        for (const image of images) {
          try {
            await ultra.dfuUpdateImage(image)
            isUploadSuccess = true
            break
          } catch (err) {
            console.error(errToJson(_.set(new Error(err.message), 'cause', err)))
          }
        }
        if (!isUploadSuccess) throw new Error('Upload failed')
      }
    } catch (err) {
      console.error(errToJson(_.set(new Error(err.message), 'cause', err)))
    } finally {
      if (ultra.isConnected()) await ultra.disconnect().catch(() => {}) // ignore disconnect error
      await sleep(3000)
    }
  }

  // console.log(`version: ${await ultra.cmdGetAppVersion()} (${await ultra.cmdGetGitVersion()})`)
  process.exit(0)
}

async function fetchManifest (): Promise<Manifest> {
  const url = new URL(`https://taichunmin.idv.tw/ChameleonUltra-releases/manifest.json?t=${Math.trunc(Date.now() / 6e5)}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch manifest failed: ${res.status} ${res.statusText}`)
  return await res.json() as Manifest
}

interface ManifestReleaseAsset {
  name: string
  size: number
  url: string
}

interface ManifestRelease {
  assets: ManifestReleaseAsset[]
  commit: string
  createdAt: string
  gitVersion?: string
  prerelease: boolean
  tagName: string
}

interface Manifest {
  lastModifiedAt: string
  releases: ManifestRelease[]
}
