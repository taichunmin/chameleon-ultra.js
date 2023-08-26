import _ from 'lodash'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import nodePolyfills from 'rollup-plugin-polyfill-node'
import pkg from './package.json' assert { type: 'json' }
import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'
import versionInjector from 'rollup-plugin-version-injector'

const external = [
  ..._.keys(pkg.dependencies),
  'stream',
]
const globals = {
  'web-serial-polyfill': 'window.navigator',
  'web-streams-polyfill': 'window',
  'webbluetooth': 'window.navigator',
  lodash: '_',
}

const versionInjectorPlugin = versionInjector({
  injectInTags: {
    fileRegexp: /\.(js|mjs|cjs|html|css)$/,
  },
})

export default [
  // src/index.ts
  {
    external,
    input: 'src/index.ts',
    plugins: [typescript(), nodeResolve({ browser: true }), commonjs(), nodePolyfills(), versionInjectorPlugin],
    output: [
      { file: 'dist/es/index.mjs', format: 'es' },
      { file: 'dist/cjs/index.cjs', format: 'cjs' },
      { file: 'dist/iife/index.js', format: 'iife', globals, name: 'ChameleonUltraJS' },
      { file: 'dist/iife/index.min.js', format: 'iife', globals, name: 'ChameleonUltraJS', plugins: [terser()] },
    ],
  },

  // src/buffer.ts
  {
    external,
    input: 'src/buffer.ts',
    plugins: [typescript(), nodeResolve({ browser: true }), commonjs(), nodePolyfills()],
    output: [
      { file: 'dist/es/buffer.mjs', format: 'es' },
      { file: 'dist/cjs/buffer.cjs', format: 'cjs' },
      { file: 'dist/iife/buffer.js', format: 'iife', globals, name: 'Buffer' },
      { file: 'dist/iife/buffer.min.js', format: 'iife', globals, name: 'Buffer', plugins: [terser()] },
    ],
  },

  // src/plugin/SerialPortAdapter.ts (cjs, es)
  // {
  //   external,
  //   input: `src/plugin/SerialPortAdapter.ts`,
  //   plugins: [typescript()],
  //   output: [
  //     { file: `dist/cjs/plugin/SerialPortAdapter.cjs`, format: 'cjs' },
  //     { file: `dist/es/plugin/SerialPortAdapter.mjs`, format: 'es' },
  //   ]
  // },

  // src/plugin/WebbleAdapter.ts (esm, iife)
  // {
  //   external,
  //   input: `src/plugin/WebbleAdapter.ts`,
  //   plugins: [typescript(), nodeResolve({ browser: true }), commonjs(), nodePolyfills()],
  //   output: [
  //     { file: `dist/es/plugin/WebbleAdapter.mjs`, format: 'es' },
  //     { file: 'dist/iife/plugin/WebbleAdapter.js', format: 'iife', globals, name: 'ChameleonWebbleAdapter' },
  //     { file: 'dist/iife/plugin/WebbleAdapter.min.js', format: 'iife', globals, name: 'ChameleonWebbleAdapter', plugins: [terser()] },
  //   ]
  // },

  // src/plugin/WebserialAdapter.ts (esm, iife)
  {
    external,
    input: `src/plugin/WebserialAdapter.ts`,
    plugins: [typescript(), nodeResolve({ browser: true }), commonjs(), nodePolyfills()],
    output: [
      { file: `dist/es/plugin/WebserialAdapter.mjs`, format: 'es' },
      { file: 'dist/iife/plugin/WebserialAdapter.js', format: 'iife', globals, name: 'ChameleonUltraJS.WebserialAdapter' },
      { file: 'dist/iife/plugin/WebserialAdapter.min.js', format: 'iife', globals, name: 'ChameleonUltraJS.WebserialAdapter', plugins: [terser()] },
    ]
  },

  // src/plugin/LoggerRxTx.ts (esm, iife)
  {
    external,
    input: `src/plugin/LoggerRxTx.ts`,
    plugins: [typescript(), nodeResolve({ browser: true }), commonjs(), nodePolyfills()],
    output: [
      { file: `dist/es/plugin/LoggerRxTx.mjs`, format: 'es' },
      { file: 'dist/iife/plugin/LoggerRxTx.js', format: 'iife', globals, name: 'ChameleonUltraJS.LoggerRxTx' },
      { file: 'dist/iife/plugin/LoggerRxTx.min.js', format: 'iife', globals, name: 'ChameleonUltraJS.LoggerRxTx', plugins: [terser()] },
    ]
  },
]