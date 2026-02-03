import { readFileSync } from 'fs';
import { getPlugins } from './scripts/rollup-config-helper.js';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.mjs',
    format: 'esm',
    sourcemap: true,
  },
  external: ['@galacean/engine', '@galacean/engine-math'],
  plugins: getPlugins(pkg, { target: 'ES2020' }),
};
