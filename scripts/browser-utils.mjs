import { access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

export async function chromiumPath() {
  if (process.env.NOVA_BROWSER_EXECUTABLE) return process.env.NOVA_BROWSER_EXECUTABLE;
  const installed = chromium.executablePath();
  if (await access(installed).then(() => true).catch(() => false)) return installed;
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
    const versions = (await readdir(cache).catch(() => [])).filter(name => /^chromium-\d+$/.test(name)).sort().reverse();
    for (const version of versions) for (const folder of ['chrome-win64', 'chrome-win']) {
      const path = join(cache, version, folder, 'chrome.exe');
      if (await access(path).then(() => true).catch(() => false)) return path;
    }
  }
  return installed;
}
