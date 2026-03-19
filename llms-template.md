{{header}}
## quick start

### install

#### Package manager

```shell
# use npm
npm install chameleon-ultra.js

# use yarn
yarn add chameleon-ultra.js
```

And then import the library using `import` or `require`:

```js
import { Buffer, ChameleonUltra } from 'chameleon-ultra.js'
import WebbleAdapter from 'chameleon-ultra.js/plugin/WebbleAdapter'
import WebserialAdapter from 'chameleon-ultra.js/plugin/WebserialAdapter'
```

#### CDN

Powered by jsDelivr CDN:

```html
<!-- script -->
<script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/index.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/Crypto1.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/plugin/WebbleAdapter.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/dist/plugin/WebserialAdapter.global.js"></script>
<script>
  const { Buffer, ChameleonUltra, WebbleAdapter, WebserialAdapter } = window.ChameleonUltraJS
</script>

<!-- module -->
<script type="module">
  import { Buffer, ChameleonUltra } from 'https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm'
  import WebbleAdapter from 'https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/plugin/WebbleAdapter/+esm'
  import WebserialAdapter from 'https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/plugin/WebserialAdapter/+esm'
</script>

<!-- module + async import -->
<script type="module">
  const { Buffer, ChameleonUltra } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/+esm')
  const { default: WebbleAdapter } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/plugin/WebbleAdapter/+esm')
  const { default: WebserialAdapter } = await import('https://cdn.jsdelivr.net/npm/chameleon-ultra.js@0/plugin/WebserialAdapter/+esm')
</script>
```

### Register adapter

The ChameleonUltra class requires exactly one adapter plugin to work. If you want to support both WebBLE and WebSerial, you can create two instances of ChameleonUltra and use different adapters for each instance.

```js
// For WebSerial and WebBluetooth
const ultraUsb = new ChameleonUltra()
ultraUsb.use(new WebserialAdapter())
const ultraBle = new ChameleonUltra()
ultraBle.use(new WebbleAdapter())

// For Node.js with SerialPortAdapter
const ultraNode = new ChameleonUltra()
ultraNode.use(new SerialPortAdapter())
```

### Get the device Git version

```js
await (async ultra => {
  console.log(await ultra.cmdGetGitVersion()) // 'v2.0.0-209-gc68ea99'
})(ultraUsb) // or ultraBle, ultraNode
```

{{section:Guides}}

{{declarations}}
