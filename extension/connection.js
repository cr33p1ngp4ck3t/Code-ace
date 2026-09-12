import { DEFAULT_BACKEND, normalizeBackend, getBackend, backendRequest } from './backend.js';

export function mountConnection() {
  const details = document.createElement('details'); details.className = 'connection';
  const summary = document.createElement('summary'); summary.textContent = 'Server connection'; details.append(summary);
  const label = document.createElement('label'); label.htmlFor = 'backend-url'; label.textContent = 'Backend URL';
  const url = document.createElement('input'); url.id = 'backend-url'; url.type = 'url'; url.placeholder = DEFAULT_BACKEND; url.spellcheck = false;
  const codeLabel = document.createElement('label'); codeLabel.htmlFor = 'backend-code'; codeLabel.textContent = 'Server access code (if required)';
  const code = document.createElement('input'); code.id = 'backend-code'; code.type = 'password'; code.autocomplete = 'off'; code.placeholder = 'Separate from your Groq API key';
  const hint = document.createElement('p'); hint.textContent = 'The address is remembered. The access code stays in this browser session. An SSH tunnel can use a local address.';
  const save = document.createElement('button'); save.id = 'save-backend'; save.type = 'button'; save.className = 'secondary'; save.textContent = 'Save and test connection';
  const status = document.createElement('p'); status.id = 'connection-status'; status.setAttribute('role', 'status');
  details.append(label, url, codeLabel, code, hint, save, status);
  document.querySelector('footer').before(details);
  getBackend().then(config => { url.value = config.url; code.value = config.token; }).catch(error => { status.textContent = error.message; });
  save.addEventListener('click', async () => {
    let base;
    try { base = normalizeBackend(url.value); } catch (error) { status.textContent = error.message; return; }
    save.disabled = true;
    try {
      // Must remain directly within the click gesture for Chrome's permission prompt.
      const granted = await chrome.permissions.request({ origins: [`${new URL(base).protocol}//${new URL(base).hostname}/*`] });
      if (!granted) throw new Error('Allow Verifeed to connect to this server to save it.');
      const token = code.value.trim();
      if (token.startsWith('gsk_')) throw new Error('Keep your Groq key on the server. Enter VERIFEED_ACCESS_TOKEN here, or leave this blank for an SSH tunnel.');
      await chrome.storage.local.set({ backendUrl: base });
      await chrome.storage.session.set({ backendToken: { url: base, token } });
      const oldScripts = await chrome.scripting.getRegisteredContentScripts({ ids: ['nova-backend-demo'] });
      if (oldScripts.length) await chrome.scripting.unregisterContentScripts({ ids: ['nova-backend-demo'] });
      await chrome.scripting.registerContentScripts([{ id: 'nova-backend-demo', matches: [`${new URL(base).protocol}//${new URL(base).hostname}/demo*`], js: chrome.runtime.getManifest().content_scripts[0].js, runAt: 'document_idle' }]);
      const result = await backendRequest({ url: base, token }, '/api/status');
      if (typeof result.authenticated !== 'boolean' && typeof result.configured !== 'boolean') throw new Error('This address is not a compatible Verifeed backend.');
      if (result.requiresAccess && !result.authenticated) throw new Error('Address saved. Enter the matching VERIFEED_ACCESS_TOKEN from the server.');
      status.textContent = result.configured ? 'Connected. The server has a Groq key loaded; a content check verifies model access.' : 'Connected. Add a Groq key to the remote server to enable AI checks.';
    } catch (error) { status.textContent = error.message; }
    finally { save.disabled = false; }
  });
}
