import { Buffer } from '@taichunmin/buffer'
import JSZip from 'jszip'
import * as _ from 'lodash-es'
import { setObject } from '../iifeExportHelper'
import { type DfuImage, type DfuImageType, type DfuManifest } from '../types'

export default class DfuZip {
  #appImage?: DfuImage | null
  #baseImage?: DfuImage | null
  #gitVersion?: string | null
  #manifest: DfuManifest | null = null
  #zip: JSZip | null = null
  readonly #buf: Buffer

  constructor (buf: Buffer) {
    this.#buf = buf
  }

  async getManifest (): Promise<DfuManifest> {
    this.#zip ??= await JSZip.loadAsync(this.#buf)
    this.#manifest ??= await (async () => {
      const manifestJson = await this.#zip?.file('manifest.json')?.async('string')
      if (_.isNil(manifestJson)) throw new Error('Unable to find manifest, is this a proper DFU package?')
      return JSON.parse(manifestJson).manifest
    })()
    return this.#manifest as DfuManifest
  }

  async getFirstImageFile (types: DfuImageType[]): Promise<DfuImage | null> {
    const manifest = await this.getManifest()
    for (const type of types) {
      const image = manifest[type]
      if (_.isNil(image)) continue
      const [header, body] = await Promise.all(_.map([image.dat_file, image.bin_file], async file => {
        const u8 = await this.#zip?.file(file)?.async('uint8array')
        if (_.isNil(u8)) throw new Error(`Failed to read ${file} from DFU package`)
        return Buffer.fromView(u8)
      }))
      return { type, header, body }
    }
    return null
  }

  async getBaseImage (): Promise<DfuImage | null> {
    if (this.#baseImage === undefined) this.#baseImage = await this.getFirstImageFile(['softdevice', 'bootloader', 'softdevice_bootloader'])
    return this.#baseImage
  }

  async getAppImage (): Promise<DfuImage | null> {
    if (this.#appImage === undefined) this.#appImage = await this.getFirstImageFile(['application'])
    return this.#appImage
  }

  async getGitVersion (): Promise<string | null> {
    if (this.#gitVersion === undefined) {
      const image = await this.getAppImage()
      // eslint-disable-next-line no-control-regex
      this.#gitVersion = image?.body.toString('utf8').match(/\x00(v\d+(?:\.\d+)*[\w-]*)\x00/)?.[1] ?? null
    }
    return this.#gitVersion
  }
}

setObject(globalThis, ['ChameleonUltraJS', 'DfuZip'], DfuZip)
