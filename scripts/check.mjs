import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
async function visit(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (['node_modules', '.git', 'artifacts'].includes(entry.name)) continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) await visit(full);
    else if (/\.(?:m?js)$/.test(entry.name)) { const result = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' }); if (result.status) { console.error(result.stderr); process.exitCode = 1; } }
    else if (entry.name.endsWith('.json')) JSON.parse(await readFile(full, 'utf8'));
  }
}
await visit('.');
if (!process.exitCode) console.log('JavaScript syntax and JSON files checked.');
