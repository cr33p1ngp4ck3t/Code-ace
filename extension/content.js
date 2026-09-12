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
    en: { check: 'No obvious issues', high: 'Strong warning', caution: 'Needs review', unknown: 'Not checked', ai: 'AI-style signals', disclosed: 'AI mentioned', title: 'Review this post with Verifeed', local: 'Local pattern check; no AI call. Green: no obvious warning signs, not guaranteed safe. Yellow: needs review or has unchecked content. Red: strong scam warning signs, not confirmed fraud. Click to see the evidence.' },
    ur: { check: 'واضح مسئلہ نہیں', high: 'شدید انتباہ', caution: 'جائزہ ضروری', unknown: 'جانچ باقی ہے', ai: 'اے آئی انداز', disclosed: 'اے آئی کا ذکر', title: 'Verifeed سے پوسٹ کا جائزہ', local: 'مقامی نشانیاں؛ اے آئی استعمال نہیں ہوا۔ سبز: واضح خطرہ نہیں، حفاظت کی ضمانت نہیں۔ پیلا: جائزہ یا جانچ ضروری۔ سرخ: دھوکے کی مضبوط نشانیاں، حتمی ثبوت نہیں۔' }
  };
  const style = ':host{display:flex!important;justify-content:flex-end!important;clear:both!important;margin:6px 12px 8px!important;font:11px/1.3 Arial,sans-serif!important;color:#52654a!important}*{box-sizing:border-box}.wrap{display:inline-flex;max-width:100%}.signal-green{--signal:#238641;--ink:#fff;--border:#b8d7ba;--surface:#f1f8ef;--text:#386041}.signal-yellow{--signal:#eab308;--ink:#513807;--border:#efd48a;--surface:#fffbea;--text:#795d1e}.signal-red{--signal:#dc2626;--ink:#fff;--border:#efb4b4;--surface:#fff2f2;--text:#a32e2e}button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:20px;background:var(--surface);color:var(--text);padding:5px 9px;min-height:28px;font:11px/1.3 Arial,sans-serif;cursor:pointer;white-space:nowrap}.mark{font-weight:600}.dot{width:16px;height:16px;flex:none;display:grid;place-items:center;border-radius:50%;background:var(--signal);color:var(--ink);font:bold 11px/1 Arial,sans-serif;box-shadow:0 0 0 2px #fff}.label{font-size:10px}button:hover{filter:brightness(.96)}button:focus-visible{outline:3px solid #b38351;outline-offset:3px}';
  function node(tag, text, className) { const value = document.createElement(tag); if (text) value.textContent = text; if (className) value.className = className; return value; }
  function render(element, post, existing) {
    const result = NovaRules.scan({ ...post, language }), writing = VerifeedWriting.scan(post.text, language), w = copy[language];
    const host = existing?.host || node('div'); host.dataset.novaHost = '';
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' }); root.replaceChildren();
    const hasWriting = ['signals', 'disclosed'].includes(writing.status);
    const signal = result.risk === 'high' ? 'red' : result.risk === 'caution' || result.risk === 'unknown' || writing.status === 'signals' ? 'yellow' : 'green';
    const wrap = node('div', '', 'wrap ' + result.risk + ' signal-' + signal + (hasWriting ? ' writing' : '')); wrap.dir = language === 'ur' ? 'rtl' : 'ltr';
    const label = result.risk === 'high' ? w.high : result.risk === 'caution' ? w.caution : result.risk === 'unknown' ? w.unknown : writing.status === 'signals' ? w.ai : writing.status === 'disclosed' ? w.disclosed : w.check;
    const button = node('button'); button.type = 'button'; button.setAttribute('aria-label', label + '. ' + w.title); button.setAttribute('aria-haspopup', 'dialog'); button.title = result.headline + '. ' + writing.headline + '. ' + w.local;
    const dot = node('span', signal === 'green' ? '✓' : result.risk === 'unknown' ? '?' : '!', 'dot'); dot.setAttribute('aria-hidden', 'true');
    button.append(dot, node('span', 'Verifeed', 'mark'), node('span', label, 'label'));
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
