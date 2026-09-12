export function isRedirect(details) {
  return details.frameId === 0 && details.tabId >= 0 && /^https?:\/\//i.test(details.url || '') && details.transitionQualifiers?.some(value => value === 'client_redirect' || value === 'server_redirect');
}
let listening = false;
export function installWebsiteNavigation() {
  if (listening || !chrome.webNavigation?.onCommitted) return;
  listening = true;
  chrome.webNavigation.onCommitted.addListener(async details => {
    if (!isRedirect(details) || !details.documentId) return;
    try {
      const { websiteGuard } = await chrome.storage.local.get('websiteGuard');
      if (!websiteGuard) return;
      // A document ID prevents a delayed check from landing on the next page.
      await chrome.scripting.executeScript({ target: { tabId: details.tabId, documentIds: [details.documentId] }, injectImmediately: true, files: ['shared/rules.js', 'shared/writing.js', 'shared/website.js', 'panel.js', 'website-guard.js'] });
    } catch { /* Navigation changed or the browser did not grant this site's access. */ }
  });
}
