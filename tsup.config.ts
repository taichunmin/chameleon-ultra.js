import { defineConfig, type Options } from 'tsup'
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill'
import pkg from './package.json'

const sharedConfig: Options = {
  env: { VERSION: pkg.version },
  experimentalDts: true,
  keepNames: true,
  publicDir: 'public',
  splitting: false,
}

// SerialPortAdapter needs the real `stream`
const nodePolyfill = nodeModulesPolyfillPlugin({
  fallback: 'none',
  globals: { Buffer: false },
  modules: { 'stream/web': 'empty' },
})

const iifePolyfill = nodeModulesPolyfillPlugin({
  fallback: 'error',
  globals: { Buffer: false },
  modules: { 'stream/web': 'empty', stream: 'empty' },
})

const formats: Options[] = [
  { format: ['cjs', 'esm'], esbuildPlugins: [nodePolyfill] },
  { format: ['iife'], esbuildPlugins: [iifePolyfill] },
]

export default defineConfig((options): Options[] => formats.flatMap((formatConfig, i) => [
  {
    ...sharedConfig,
    ...formatConfig,
    clean: i === 0 && !options.watch, // only clean once when not watching
    minify: !options.watch,
    globalName: 'ChameleonUltraJS',
    entry: ['src/index.ts'],
  },
  {
    ...sharedConfig,
    ...formatConfig,
    minify: !options.watch,
    entry: [
      'src/Crypto1.ts',
      'src/plugin/Debug.ts',
      'src/plugin/DfuZip.ts',
      'src/plugin/SerialPortAdapter.ts',
      'src/plugin/WebbleAdapter.ts',
      'src/plugin/WebserialAdapter.ts',
    ],
  },
]))
