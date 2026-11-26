#!/usr/bin/env node
/**
 * Builds the complete Web VHDL Laboratory into P6A/dist:
 *   dist/       P6A editor (this app)
 *   dist/P6B/   P6B Run, Results & Waveforms (built from ../P6B, unchanged)
 *
 * Cross-platform (Windows, macOS, Linux): `npm run build:lab`, then
 * `npm run preview` and open http://localhost:4174/
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const p6a = resolve(here, '..');
const p6b = resolve(p6a, '../P6B');
const run = (cmd, cwd) => {
  console.log(`\n> ${cmd}   (in ${cwd})`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
};

if (!existsSync(join(p6b, 'package.json'))) {
  console.error(`P6B not found at ${p6b}`);
  process.exit(1);
}
if (!existsSync(join(p6b, 'node_modules'))) run(existsSync(join(p6b, 'package-lock.json')) ? 'npm ci' : 'npm install', p6b);
run('npm run build', p6b);
run('npm run build', p6a);

const target = join(p6a, 'dist', 'P6B');
rmSync(target, { recursive: true, force: true });
cpSync(join(p6b, 'dist'), target, { recursive: true });
console.log(`\nBuilt the lab into ${join(p6a, 'dist')} (P6B at dist/P6B/). Preview: npm run preview`);
