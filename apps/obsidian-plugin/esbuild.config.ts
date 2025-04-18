import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { build } from 'esbuild';

const isWatch = process.argv.includes('--watch');
const outdir = 'dist';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: `${outdir}/main.js`,
  platform: 'node',
  format: 'cjs',
  sourcemap: true,
  minify: !isWatch,
  external: ['obsidian', '@obsidian-magic/core'],
});

function copyAssets() {
  for (const file of ['manifest.json', 'styles.css']) {
    try {
      mkdirSync(outdir, { recursive: true });
      copyFileSync(resolve(file), resolve(outdir, file));
      console.log(`Copied ${file} to ${outdir}/`);
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
}
copyAssets();
