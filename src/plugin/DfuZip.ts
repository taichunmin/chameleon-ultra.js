import _ from 'lodash'
import { Buffer } from '@taichunmin/buffer'
import JSZip from 'jszip'

export default class DfuZip {
  readonly #buf: Buffer
  #zip: JSZip | null = null
  #manifest: DfuManifest | null = null

  constructor (buf: Buffer) {
    this.#buf = buf
  }

  async getManifest (): Promise<DfuManifest> {
    if (_.isNil(this.#zip)) this.#zip = await JSZip.loadAsync(this.#buf)
    if (_.isNil(this.#manifest)) {
      const manifestJson = await this.#zip.file('manifest.json')?.async('string')
      if (_.isNil(manifestJson)) throw new Error('Unable to find manifest, is this a proper DFU package?')
      this.#manifest = JSON.parse(manifestJson).manifest
    }
    return this.#manifest as DfuManifest
  }

  async getImage (types: DfuImageType[]): Promise<DfuImage | null> {
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
    return await this.getImage(['softdevice', 'bootloader', 'softdevice_bootloader'])
  }

  async getAppImage (): Promise<DfuImage | null> {
    return await this.getImage(['application'])
  }
}

;((globalThis as any ?? {}).ChameleonUltraJS ?? {}).DfuZip = DfuZip // eslint-disable-line @typescript-eslint/prefer-optional-chain

export type DfuManifest = Record<DfuImageType, { bin_file: string, dat_file: string }>
export type DfuImageType = 'application' | 'softdevice' | 'bootloader' | 'softdevice_bootloader'

export interface DfuImage {
  type: DfuImageType
  header: Buffer
  body: Buffer
}
