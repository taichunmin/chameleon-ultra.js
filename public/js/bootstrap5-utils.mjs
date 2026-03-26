import _ from 'lodash'
import JSON5 from 'json5'
import Papa from 'papaparse'
import Swal from 'sweetalert2'

/** Swal showLoading */
export function showLoading (opts = {}) {
  opts = {
    allowOutsideClick: false,
    showConfirmButton: false,
    ...opts,
  }
  if (Swal.isVisible()) return Swal.update(_.omit(opts, ['progressStepsDistance']))
  Swal.fire({ ...opts, didRender: () => { Swal.showLoading() } })
}

/** JSON5.parse with default value */
export function parseJson5OrDefault (str, defaultVal) {
  try {
    return JSON5.parse(str)
  } catch (err) {
    return defaultVal
  }
}

export async function getJson (url, cachetime = 3e4) {
  if (_.isString(url)) url = new URL(url)
  url.searchParams.set('cachebust', Math.trunc(Date.now() / cachetime))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}`)
  return await res.json()
}

export async function getCsv (url, cachetime = 3e4) {
  const { fetch } = window
  const tmp = new URL(url)
  tmp.searchParams.set('cachebust', Math.trunc(Date.now() / cachetime))
  const res = await fetch(tmp.href)
  if (!res.ok) throw new Error(`Failed to fetch ${tmp.href}`)
  return Papa.parse(await res.text(), { encoding: 'utf8', header: true })?.data ?? []
}

export async function btnCopy (text, container = null) {
  container ??= document.body
  const dom = document.createElement('textarea')
  dom.value = text = `${text}`
  container.appendChild(dom)
  dom.select()
  dom.setSelectionRange(0, 1e6) // For mobile devices
  document.execCommand('copy')
  container.removeChild(dom)
}

export async function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function loadPageStorage (storage, obj) {
  try {
    const saved = JSON5.parse(storage.getItem(location.pathname))
    if (!_.isObject(saved)) return
    _.merge(obj, saved)
  } catch (err) {}
}

export function savePageStorage (storage, obj) {
  storage.setItem(location.pathname, JSON5.stringify(obj))
}

export async function swalFire (args) {
  if (_.isPlainObject(args)) args.footer ??= '<a target="_blank" href="https://github.com/RfidResearchGroup/ChameleonUltra?tab=readme-ov-file#official-channels">Have questions? Join Discord!</a>'
  return await Swal.fire(args)
}

export async function btnAdapterTips () {
  await swalFire({
    title: 'Browser & OS',
    html: '<strong class="text-success">BLE</strong> is supported in ChromeOS, Chrome for Windows 10, macOS, Android 6.0, Microsoft Edge for Windows and <a class="btn-link" target="_blank" href="https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055">Bluefy</a> for iPhone and iPad.<hr><strong class="text-success">USB</strong> is supported on all desktop platforms (ChromeOS, Linux, macOS, and Windows).',
  })
}

export function enumToOptions (e) {
  return _.omitBy(e, v => _.isFinite(v))
}
