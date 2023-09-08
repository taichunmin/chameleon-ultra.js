import _ from 'lodash'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import nodePolyfills from 'rollup-plugin-polyfill-node'
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import versionInjector from 'rollup-plugin-version-injector'

const external = [
  'lodash',
  'serialport',
  'stream',
  'web-streams-polyfill',
  'webbluetooth',
]

const globals = {
  'node:stream/web': 'window',
  'webbluetooth': 'window.navigator',
  lodash: '_',
}

const versionInjectorPlugin = versionInjector({
  logLevel: 'error',
  injectInTags: {
    fileRegexp: /\.(js|mjs|cjs|html|css)$/,
  },
})

const tsconfig = {
  "lib": ["es2023"],
  "module": "ESNext",
  "target": "ESNext",
  "strict": true,
  "esModuleInterop": true,
  "skipLibCheck": true,
  "forceConsistentCasingInFileNames": true,
  "moduleResolution": "bundler"
}

const terserConfig = {
  mangle: {
    reserved: ['Buffer'],
  }
}

export default [
  // src/index.ts
  {
    external,
    input: 'src/index.ts',
    plugins: [typescript(tsconfig), nodeResolve({ browser: true }), commonjs(), versionInjectorPlugin],
    output: [
      { file: 'dist/es/index.mjs', format: 'es' },
      { file: 'dist/cjs/index.cjs', format: 'cjs' },
      { file: 'dist/iife/index.js', format: 'iife', globals, name: 'ChameleonUltraJS' },
      { file: 'dist/iife/index.min.js', format: 'iife', globals, name: 'ChameleonUltraJS', plugins: [terser(terserConfig)] },
    ],
  },

  // src/buffer.ts
  {
    external,
    input: 'src/buffer.ts',
    plugins: [typescript(tsconfig), nodeResolve({ browser: true }), commonjs()],
    output: [
      { file: 'dist/es/buffer.mjs', format: 'es' },
      { file: 'dist/cjs/buffer.cjs', format: 'cjs' },
      { file: 'dist/iife/buffer.js', format: 'iife', globals, name: 'Buffer' },
      { file: 'dist/iife/buffer.min.js', format: 'iife', globals, name: 'Buffer', plugins: [terser(terserConfig)] },
    ],
  },

  // src/Crypto1.ts
  {
    external,
    input: 'src/Crypto1.ts',
    plugins: [typescript(tsconfig), nodeResolve({ browser: true }), commonjs()],
    output: [
      { file: 'dist/es/Crypto1.mjs', format: 'es' },
      { file: 'dist/cjs/Crypto1.cjs', format: 'cjs' },
      { file: 'dist/iife/Crypto1.js', format: 'iife', globals, name: 'Crypto1' },
      { file: 'dist/iife/Crypto1.min.js', format: 'iife', globals, name: 'Crypto1', plugins: [terser(terserConfig)] },
    ],
  },

  // src/plugin/SerialPortAdapter.ts (cjs, es)
  {
    external,
    input: `src/plugin/SerialPortAdapter.ts`,
    plugins: [typescript(tsconfig), nodeResolve({ browser: true }), commonjs()],
    output: [
      { file: `dist/cjs/plugin/SerialPortAdapter.cjs`, format: 'cjs' },
      { file: `dist/es/plugin/SerialPortAdapter.mjs`, format: 'es' },
    ]
  },

  // src/plugin/WebbleAdapter.ts (esm, iife)
  {
    external,
    input: `src/plugin/WebbleAdapter.ts`,
    plugins: [typescript(tsconfig), nodeResolve({ browser: true }), commonjs()],
    output: [
      { file: `dist/cjs/plugin/WebbleAdapter.cjs`, format: 'cjs' },
      { file: `dist/es/plugin/WebbleAdapter.mjs`, format: 'es' },
      { file: 'dist/iife/plugin/WebbleAdapter.js', format: 'iife', globals, name: 'ChameleonUltraJS.WebbleAdapter' },
      { file: 'dist/iife/plugin/WebbleAdapter.min.js', format: 'iife', globals, name: 'ChameleonUltraJS.WebbleAdapter', plugins: [terser(terserConfig)] },
    ]
  },

  // src/plugin/WebserialAdapter.ts (esm, iife)
  {
    external,
    input: `src/plugin/WebserialAdapter.ts`,
    plugins: [typescript(tsconfig), nodeResolve({ browser: true }), commonjs()],
    output: [
      { file: `dist/cjs/plugin/WebserialAdapter.cjs`, format: 'cjs' },
      { file: `dist/es/plugin/WebserialAdapter.mjs`, format: 'es' },
      { file: 'dist/iife/plugin/WebserialAdapter.js', format: 'iife', globals, name: 'ChameleonUltraJS.WebserialAdapter' },
      { file: 'dist/iife/plugin/WebserialAdapter.min.js', format: 'iife', globals, name: 'ChameleonUltraJS.WebserialAdapter', plugins: [terser(terserConfig)] },
    ]
  },
]
