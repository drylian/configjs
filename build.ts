import { build, type Options } from 'tsup'
import { writeFile } from 'fs/promises'
import { generateDtsBundle } from 'dts-bundle-generator'
import { join } from 'path'
import { rm } from 'fs/promises'

// Limpa o diretório de distribuição anterior
await rm('dist', { recursive: true, force: true })

// Banner emitted at the top of every compiled bundle. Points AI tools/agents
// to the machine-readable usage guide.
const AI_BANNER =
  '/**\n' +
  ' * kfg - type-safe configuration system.\n' +
  ' * AI/LLM instructions and full usage guide: https://kfg.js.org/llms.txt\n' +
  ' * (covers schema rules, drivers, the safeguard layer, and writing custom drivers)\n' +
  ' */'

const config: Options = {
  platform: 'node',
  entry: ['src/index.ts'],
  bundle: true,
  skipNodeModulesBundle: true,
  clean: true,
  dts: false,
  format: ['cjs', 'esm'],
  outDir: 'dist',
  splitting: false,
  shims: true,
  banner: { js: AI_BANNER },
  tsconfig: './tsconfig.json'
}

await build(config)

const dtsPath = join(process.cwd(), 'dist/index.d.ts')
const dtsCode = generateDtsBundle([{
  filePath: join(process.cwd(), 'src/index.ts'),
  output: {
    sortNodes: true,
    exportReferencedTypes: true,
    inlineDeclareExternals: true,
    inlineDeclareGlobals: true
  }
}])

await writeFile(dtsPath, `${AI_BANNER}\n${dtsCode[0]}`, { encoding: 'utf-8' })
