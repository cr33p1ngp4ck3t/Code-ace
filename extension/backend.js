export const DEFAULT_BACKEND = 'http://127.0.0.1:4318';
export function normalizeBackend(raw = DEFAULT_BACKEND) {
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error('Enter a complete backend address, such as https://verifeed.example.com'); }
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.pathname !== '/' || url.search || url.hash) throw new Error('Use an HTTPS server address, or http://127.0.0.1:PORT for an SSH tunnel. Do not include a path or credentials.');
  return url.origin;
}
export async function getBackend() {
  const { backendUrl } = await chrome.storage.local.get('backendUrl');
  const { backendToken } = await chrome.storage.session.get('backendToken');
  const url = normalizeBackend(backendUrl || DEFAULT_BACKEND);
  return { url, token: backendToken?.url === url && typeof backendToken.token === 'string' ? backendToken.token : '' };
}
export async function backendRequest(config, path, body) {
  let response;
  try { response = await fetch(`${config.url}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(path === '/api/analyze' ? 145000 : 20000) }); }
  catch { throw new Error('Could not reach the selected backend. Check Server connection in Verifeed’s popup and make sure the server or SSH tunnel is running.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('This address did not return a Verifeed response. Check the backend URL.'); }
  if (!response.ok) throw new Error(data.error || 'The backend rejected this request. Check its access code.');
  return data;
}
export function studioUrl(base, { draft, ticket, demo = false } = {}) {
  const url = new URL(demo ? '/demo' : '/', base);
  if (draft) url.searchParams.set('draft', draft);
  if (ticket) url.hash = new URLSearchParams({ ticket }).toString();
  return url.href;
}
export async function openStudio(demo = false) {
  const backend = await getBackend();
  if (demo) { await chrome.tabs.create({ url: studioUrl(backend.url, { demo: true }) }); return; }
  const status = await backendRequest(backend, '/api/status');
  let ticket = null;
  if (status.requiresAccess) {
    if (!status.authenticated) throw new Error('Enter the server access code under Server connection in Verifeed’s popup.');
    ticket = (await backendRequest(backend, '/api/tickets', {})).ticket;
  }
  await chrome.tabs.create({ url: studioUrl(backend.url, { ticket }) });
}
