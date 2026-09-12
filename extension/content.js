(() => {
  if (globalThis.__novaContentLoaded) { globalThis.__novaScan?.(); return; }
  globalThis.__novaContentLoaded = true;
  let language = 'en', enabled = true, scheduled = false, count = 0;
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && message.type === 'VERIFEED_CONTEXT_REVIEW') VerifeedPanel.open(message.post, language);
  });
  const adapter = NovaAdapters.adapterFor(); if (!adapter) return;
  document.querySelectorAll('[data-nova-host]').forEach(node => node.remove());
  const tracked = new WeakMap();
  const copy = {
    en: { check: 'Check', high: 'Warning', caution: 'Caution', ai: 'AI style?', disclosed: 'AI mentioned', title: 'Review this post with Verifeed', local: 'Local pattern check; no AI call. Click to see the evidence.' },
    ur: { check: 'جانچیں', high: 'انتباہ', caution: 'احتیاط', ai: 'اے آئی انداز؟', disclosed: 'اے آئی کا ذکر', title: 'Verifeed سے پوسٹ کا جائزہ', local: 'مقامی نشانیاں؛ اے آئی استعمال نہیں ہوا۔ تفصیل کے لیے دبائیں۔' }
  };
  const style = ':host{display:flex!important;justify-content:flex-end!important;clear:both!important;margin:6px 12px 8px!important;font:11px/1.3 Arial,sans-serif!important;color:#52654a!important}*{box-sizing:border-box}.wrap{display:inline-flex;max-width:100%}button{display:inline-flex;align-items:center;gap:6px;border:1px solid #dce4d5;border-radius:20px;background:#f7f9f3;color:#58704d;padding:5px 9px;min-height:28px;font:11px/1.3 Arial,sans-serif;cursor:pointer;white-space:nowrap}.mark{font-weight:600}.dot{width:6px;height:6px;flex:none;border-radius:50%;background:#7c956c}.high .dot{background:#b15338}.high button{color:#9d4c33;border-color:#ead6cb;background:#fff7f1}.caution .dot{background:#ab8438}.unknown .dot{background:#969e8d}.writing .label{color:#785898}.label{font-size:10px}button:hover{border-color:#a5b593;background:#edf3e6}button:focus-visible{outline:3px solid #b38351;outline-offset:3px}';
  function node(tag, text, className) { const value = document.createElement(tag); if (text) value.textContent = text; if (className) value.className = className; return value; }
  function render(element, post, existing) {
    const result = NovaRules.scan({ ...post, language }), writing = VerifeedWriting.scan(post.text, language), w = copy[language];
    const host = existing?.host || node('div'); host.dataset.novaHost = '';
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' }); root.replaceChildren();
    const hasWriting = ['signals', 'disclosed'].includes(writing.status);
    const wrap = node('div', '', 'wrap ' + result.risk + (hasWriting ? ' writing' : '')); wrap.dir = language === 'ur' ? 'rtl' : 'ltr';
    const label = result.risk === 'high' ? w.high : result.risk === 'caution' ? w.caution : writing.status === 'disclosed' ? w.disclosed : hasWriting ? w.ai : w.check;
    const button = node('button'); button.type = 'button'; button.setAttribute('aria-label', w.title); button.setAttribute('aria-haspopup', 'dialog'); button.title = result.headline + '. ' + writing.headline + '. ' + w.local;
    button.append(node('span', '', 'dot'), node('span', 'Verifeed', 'mark'), node('span', label, 'label'));
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (event.isTrusted) VerifeedPanel.open(post, language); });
    for (const type of ['pointerdown', 'mousedown', 'keydown']) button.addEventListener(type, event => event.stopPropagation());
    wrap.append(button); root.append(node('style', style), wrap);
    if (!existing) element.append(host);
    tracked.set(element, { host, fingerprint: JSON.stringify({ text: post.text, media: post.media, language }) });
  }
  function scan() {
    scheduled = false;
    if (!enabled) { document.querySelectorAll('[data-nova-host]').forEach(node => node.remove()); count = 0; return; }
    const posts = NovaAdapters.findPosts(document, adapter).slice(-120); count = posts.length;
    for (const element of posts) {
      const post = NovaAdapters.extractPost(element, adapter), old = tracked.get(element);
      const existing = old?.host.isConnected ? old : null;
      if (!existing || existing.fingerprint !== JSON.stringify({ text: post.text, media: post.media, language })) render(element, post, existing);
    }
  }
  function schedule() { if (scheduled) return; scheduled = true; setTimeout(scan, 350); }
  globalThis.__novaScan = scan;
  const ready = chrome.storage.local.get(['enabled', 'language']).then(settings => { enabled = settings.enabled !== false; language = settings.language === 'ur' ? 'ur' : 'en'; scan(); });
  const observer = new MutationObserver(schedule); observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-view-name', 'data-id', 'data-urn', 'class'] });
  document.addEventListener('load', event => { if (event.target instanceof HTMLImageElement || event.target instanceof HTMLVideoElement) schedule(); }, true);
  chrome.storage.onChanged.addListener((changes, area) => { if (area !== 'local') return; if (changes.enabled) enabled = changes.enabled.newValue !== false; if (changes.language) language = changes.language.newValue === 'ur' ? 'ur' : 'en'; scan(); });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id === chrome.runtime.id && message.type === 'NOVA_SCAN') { ready.then(() => { scan(); sendResponse({ count, platform: adapter.name, enabled }); }); return true; }
  });
})();
