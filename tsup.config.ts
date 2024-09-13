import { defineConfig, type Options } from 'tsup'
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill'
import pkg from './package.json' assert { type: 'json' }

const sharedConfig: Options = {
  dts: true,
  env: { VERSION: pkg.version },
  format: ['cjs', 'esm', 'iife'],
  keepNames: true,
  publicDir: 'public',
  splitting: false,
  esbuildPlugins: [
    nodeModulesPolyfillPlugin({
      globals: {
        Buffer: false,
      },
      modules: {
        'stream/web': 'empty',
        fallback: 'empty',
      },
    }),
  ],
}

export default defineConfig((options): Options[] => [
  {
    ...sharedConfig,
    clean: !options.watch, // only clean once when not watching
    minify: !options.watch,
    globalName: 'ChameleonUltraJS',
    entry: ['src/index.ts'],
  },
  {
    ...sharedConfig,
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
])
