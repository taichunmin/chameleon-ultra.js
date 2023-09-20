<div align="center">

<h1>chameleon-ultra.js</h1>

<p>A JavaScript SDK for ChameleonUltra support Web Bluetooth API, Web Serial API and Node.js.</p>

[API Reference](https://taichunmin.idv.tw/chameleon-ultra.js/docs/) | [Demos](https://github.com/taichunmin/chameleon-ultra.js/blob/master/pages/demos.md)

[![npm version](https://img.shields.io/npm/v/chameleon-ultra.js.svg?logo=npm)](https://www.npmjs.org/package/chameleon-ultra.js)
[![jsdelivr hits](https://img.shields.io/jsdelivr/npm/hm/chameleon-ultra.js?logo=jsdelivr)](https://www.jsdelivr.com/package/npm/chameleon-ultra.js)
[![Build status](https://img.shields.io/github/actions/workflow/status/taichunmin/chameleon-ultra.js/ci.yml?branch=master)](https://github.com/taichunmin/chameleon-ultra.js/actions/workflows/ci.yml)
[![Coverage Status](https://img.shields.io/coverallsCoverage/github/taichunmin/chameleon-ultra.js?branch=master)](https://coveralls.io/github/taichunmin/chameleon-ultra.js?branch=master)
[![install size](https://img.shields.io/badge/dynamic/json?url=https://packagephobia.com/v2/api.json?p=chameleon-ultra.js&query=$.install.pretty&label=install%20size)](https://packagephobia.now.sh/result?p=chameleon-ultra.js)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/chameleon-ultra.js)](https://bundlephobia.com/package/chameleon-ultra.js@latest)
[![npm downloads](https://img.shields.io/npm/dm/chameleon-ultra.js.svg)](https://npm-stat.com/charts.html?package=chameleon-ultra.js)
[![GitHub contributors](https://img.shields.io/github/contributors/taichunmin/chameleon-ultra.js)](https://github.com/taichunmin/chameleon-ultra.js/graphs/contributors)
[![Known vulnerabilities](https://snyk.io/test/npm/chameleon-ultra.js/badge.svg)](https://snyk.io/test/npm/chameleon-ultra.js)
[![MIT License](https://img.shields.io/github/license/taichunmin/chameleon-ultra.js)](https://github.com/taichunmin/chameleon-ultra.js/blob/master/LICENSE)

</div>

![](https://i.imgur.com/bWJGSGq.png)

## TOC

- [TOC](#toc)
- [Browser \& OS compatibility](#browser--os-compatibility)
  - [SerialPort (Node.js)](#serialport-nodejs)
  - [Web Bluetooth API](#web-bluetooth-api)
  - [Web Serial API](#web-serial-api)
  - [Web Serial API Polyfill](#web-serial-api-polyfill)
- [Installing](#installing)
  - [Package manager](#package-manager)
  - [CDN](#cdn)
- [Getting Started](#getting-started)
  - [Slot Enable and Emulation Mifare 1K](#slot-enable-and-emulation-mifare-1k)
  - [Set new BLE Pairing Key and Enable BLE Pairing](#set-new-ble-pairing-key-and-enable-ble-pairing)
- [Related links](#related-links)

## Browser & OS compatibility

### SerialPort (Node.js)

[Node SerialPort](https://serialport.io/docs/) is a JavaScript library for connecting to serial ports that works in NodeJS and Electron.

### Web Bluetooth API

A subset of the Web Bluetooth API is available in ChromeOS, Chrome for Android 6.0, Mac (Chrome 56) and Windows 10 (Chrome 70). See MDN's [Browser compatibility](https://developer.mozilla.org/docs/Web/API/Web_Bluetooth_API#Browser_compatibility) table for more information.

For Linux and earlier versions of Windows, enable the `#experimental-web-platform-features` flag in `about://flags`.

### Web Serial API

The Web Serial API is available on all desktop platforms (ChromeOS, Linux, macOS, and Windows) in Chrome 89. See MDN's [Browser compatibility](https://developer.mozilla.org/docs/Web/API/Serial#browser_compatibility) table for more information.

### Web Serial API Polyfill

On Android, support for USB-based serial ports is possible using the WebUSB API and the [Serial API polyfill](https://github.com/google/web-serial-polyfill). This polyfill is limited to hardware and platforms where the device is accessible via the WebUSB API because it has not been claimed by a built-in device driver.

## Installing

### Package manager

Using npm:

```bash
$ npm install chameleon-ultra.js

# Also install SerialPort if you want to run in node.js
$ npm install serialport
```

Using yarn:

```bash
$ yarn add chameleon-ultra.js

# Also install SerialPort if you want to run in node.js
$ yarn add serialport
```

Once the package is installed, you can import the library using `import` or `require`:

```js
// import
import { Buffer, ChameleonUltra } from 'chameleon-ultra.js'
import WebbleAdapter from 'chameleon-ultra.js/plugin/WebbleAdapter'
import WebserialAdapter from 'chameleon-ultra.js/plugin/WebserialAdapter'
import SerialPortAdapter from 'chameleon-ultra.js/plugin/SerialPortAdapter'

// require
const { Buffer, ChameleonUltra } = require('chameleon-ultra.js')
const WebbleAdapter = require('chameleon-ultra.js/plugin/WebbleAdapter')
const WebserialAdapter = require('chameleon-ultra.js/plugin/WebserialAdapter')
const SerialPortAdapter = require('chameleon-ultra.js/plugin/SerialPortAdapter')
```

### CDN

Using jsDelivr CDN:

```html
<!-- chameleon-ultra.js require lodash@4, place before any chameleon-ultra libraries -->
<script src="https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js"></script>

<!-- chameleon-ultra.js Core -->
<script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/iife/index.min.js"></script>
<!-- chameleon-ultra.js Crypto1 -->
<script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/iife/Crypto1.min.js"></script>
<!-- chameleon-ultra.js WebbleAdapter plugin -->
<script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/iife/plugin/WebbleAdapter.min.js"></script>
<!-- chameleon-ultra.js WebserialAdapter plugin -->
<script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/iife/plugin/WebserialAdapter.min.js"></script>
```

After the `script` tag, you can use the `chameleon-ultra.js` as following:

```js
const { Buffer, ChameleonUltra, WebbleAdapter, WebserialAdapter } = window.ChameleonUltraJS

const ultraUsb = new ChameleonUltra()
ultraUsb.use(new WebserialAdapter())
const ultraBle = new ChameleonUltra()
ultraBle.use(new WebbleAdapter())
```

## Getting Started

### Slot Enable and Emulation Mifare 1K

```js
const { Buffer, ChameleonUltra, DeviceMode, Slot, TagType, WebserialAdapter } = window.ChameleonUltraJS

const ultraUsb = new ChameleonUltra()
ultraUsb.use(new WebserialAdapter())

async function run (ultra) {
  // set slot tag type and reset data
  await ultra.cmdSlotChangeTagType(Slot.SLOT_8, TagType.MIFARE_1024)
  await ultra.cmdSlotResetTagType(Slot.SLOT_8, TagType.MIFARE_1024)
  // enable slot
  await ultra.cmdSlotSetEnable(Slot.SLOT_8, true)
  // set active slot
  await ultra.cmdSlotSetActive(Slot.SLOT_8)
  // set anti-collision and write emu block
  await ultra.cmdHf14aSetAntiCollData({
    uid: Buffer.from('11223344', 'hex'), 
    atqa: Buffer.from('0400', 'hex'), 
    sak: Buffer.from('08', 'hex'),
  })
  await ultra.cmdMf1WriteEmuBlock(0, Buffer.from('11223344440804000000000000000000', 'hex'))
  // save slot settings
  await ultra.cmdSlotSaveSettings()
  // set device mode
  await ultra.cmdChangeDeviceMode(DeviceMode.TAG)
}

run(ultraUsb)
```

### Set new BLE Pairing Key and Enable BLE Pairing

```js
const { Buffer, ChameleonUltra, DeviceMode, Slot, TagType, WebserialAdapter } = window.ChameleonUltraJS

const ultraUsb = new ChameleonUltra()
ultraUsb.use(new WebserialAdapter())

async function run (ultra) {
  await ultra.cmdBleSetPairingKey('654321')
  await ultra.cmdBleDeleteAllBonds() // need to delete all bonds before change pairing mode
  await ultra.cmdBleSetPairingMode(true)
}

run(ultraUsb)
```

## Related links

- [GitHub RfidResearchGroup/ChameleonUltra](https://github.com/RfidResearchGroup/ChameleonUltra)
- [Chameleon Ultra Guide](https://chameleonultra.com/docs)
- [Chameleon Ultra GUI Documentation](https://docs.chameleonultragui.dev/)
