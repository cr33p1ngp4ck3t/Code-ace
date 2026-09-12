let form;
const ur = () => document.documentElement.lang === 'ur';
function buildForm() {
  if (form) return form;
  form = document.createElement('form'); form.id = 'server-access'; form.className = 'server-access';
  const title = document.createElement('strong'); title.textContent = ur() ? 'اپنے سرور سے جڑیں' : 'Connect to your Verifeed server';
  const label = document.createElement('label'); label.htmlFor = 'server-access-code'; label.textContent = ur() ? 'سرور کا رسائی کوڈ' : 'Server access code';
  const input = document.createElement('input'); input.id = 'server-access-code'; input.type = 'password'; input.autocomplete = 'off'; input.required = true;
  const button = document.createElement('button'); button.className = 'button primary'; button.type = 'submit'; button.textContent = ur() ? 'جڑیں' : 'Connect';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  form.append(title, label, input, button, status);
  form.addEventListener('submit', async event => {
    event.preventDefault(); button.disabled = true;
    try {
      if (input.value.trim().startsWith('gsk_')) throw new Error('Use your Verifeed server access code here. Keep the Groq key in the server .env file.');
      await exchange({ accessToken: input.value.trim() }); input.value = ''; form.hidden = true;
      window.dispatchEvent(new Event('nova-connected'));
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  document.querySelector('.composer').prepend(form); return form;
}
export function showServerAccess() { buildForm().hidden = false; }
export function hideServerAccess() { if (form) form.hidden = true; }
async function exchange(body) {
  const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not connect to this server.');
}
export async function initializeAccess() {
  const ticket = new URLSearchParams(location.hash.slice(1)).get('ticket');
  if (ticket) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    try { await exchange({ ticket }); } catch { showServerAccess(); return false; }
  }
  try {
    const response = await fetch('/api/status'), status = await response.json();
    if (status.requiresAccess && !status.authenticated) { showServerAccess(); return false; }
    hideServerAccess(); return true;
  } catch { return true; }
}
