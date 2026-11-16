import { defineConfig, type Rolldown, type UserConfig } from 'tsdown'
import pkg from './package.json' with { type: 'json' }

// browsers have the globals, so `stream/web` named imports become undefined
const emptyStreamWeb: Rolldown.Plugin = {
  name: 'empty-stream-web',
  resolveId: id => /^(?:node:)?stream\/web$/.test(id) ? '\0empty-stream-web' : null,
  load: id => id === '\0empty-stream-web' ? 'module.exports = {}' : null,
}

const plugins = ['BufferMockAdapter', 'Debug', 'DfuZip', 'SerialPortAdapter', 'WebbleAdapter', 'WebserialAdapter']

const entry: Record<string, string> = {
  index: 'src/index.ts',
  Crypto1: 'src/Crypto1.ts',
  ...Object.fromEntries(plugins.map(name => [`plugin/${name}`, `src/plugin/${name}.ts`])),
}

// SerialPortAdapter needs Node's `serialport` and `stream`
const iifeEntries = Object.keys(entry).filter(name => name !== 'plugin/SerialPortAdapter')

export default defineConfig((options): UserConfig[] => {
  const watch = Boolean(options.watch)
  const shared: UserConfig = {
    checks: { bundlerTimings: false },
    clean: false,
    env: { VERSION: pkg.version },
    // keep `.name` of classes/functions, like esbuild's keepNames
    minify: watch ? false : { compress: { keepNames: { class: true, function: true } }, mangle: { keepNames: true } },
  }
  return [
    {
      ...shared,
      clean: !watch,
      copy: { from: 'public/**/*', flatten: false },
      deps: { onlyBundle: ['tagged-tag', 'type-fest'] }, // type-only, inlined into .d.ts
      dts: true,
      entry,
      // node10 can't resolve subpath exports without typesVersions
      attw: { enabled: 'ci-only', level: 'error', profile: 'node16', entrypoints: Object.keys(entry).map(name => name === 'index' ? '.' : `./${name}`) },
      publint: { enabled: 'ci-only', level: 'warning', strict: true },
      format: ['cjs', 'esm'],
      platform: 'node',
      outExtensions: ({ format }) => format === 'cjs' ? { js: '.js', dts: '.d.ts' } : { js: '.mjs', dts: '.d.mts' },
      outputOptions: (opts, format) => ({
        ...opts,
        chunkFileNames: `chunks/[name]-[hash]${format === 'cjs' ? '.js' : '.mjs'}`,
      }),
    },
    ...iifeEntries.map((name): UserConfig => ({
      ...shared,
      deps: { alwaysBundle: [/./], onlyBundle: false },
      entry: { [name]: entry[name] },
      format: 'iife',
      globalName: name === 'index' ? 'ChameleonUltraJS' : undefined,
      platform: 'browser',
      plugins: [emptyStreamWeb],
      outputOptions: opts => ({ ...opts, entryFileNames: '[name].global.js' }),
    })),
  ]
})
