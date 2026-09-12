export function mountWebsiteSettings() {
  const box = document.createElement('details'); box.className = 'connection website-settings';
  const summary = document.createElement('summary'); summary.textContent = 'Website redirect warnings';
  const label = document.createElement('label'); label.className = 'toggle-row';
  const title = document.createElement('span'); title.textContent = 'Warn after website redirects';
  const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.id = 'website-guard'; toggle.setAttribute('role', 'switch');
  label.append(title, toggle);
  const hint = document.createElement('p'); hint.textContent = 'Checks visible page text locally after a redirect. AI-style writing and scam warning signs are shown separately. No automatic AI calls.';
  const status = document.createElement('p'); status.id = 'website-guard-status'; status.setAttribute('role', 'status');
  box.append(summary, label, hint, status); document.querySelector('footer').before(box);
  const permissions = { permissions: ['webNavigation'], origins: ['http://*/*', 'https://*/*'] };
  Promise.all([chrome.storage.local.get('websiteGuard'), chrome.permissions.contains(permissions)]).then(([settings, allowed]) => { toggle.checked = Boolean(settings.websiteGuard && allowed); });
  toggle.addEventListener('change', async () => {
    const requested = toggle.checked; toggle.disabled = true;
    try {
      // Keep the browser permission request in the user's click gesture.
      if (requested && !await chrome.permissions.request(permissions)) { toggle.checked = false; status.textContent = 'Allow website access to enable redirect warnings.'; return; }
      await chrome.storage.local.set({ websiteGuard: requested });
      status.textContent = requested ? 'Enabled. Future redirects are checked on this device.' : 'Disabled. Website redirect checks are off.';
    } catch (error) { toggle.checked = false; status.textContent = error.message; }
    finally { toggle.disabled = false; }
  });
}
