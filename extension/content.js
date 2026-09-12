(() => {
  if (globalThis.__novaContentLoaded) { globalThis.__novaScan?.(); return; }
  globalThis.__novaContentLoaded = true;
  const adapter = NovaAdapters.adapterFor(); if (!adapter) return;
  let language = 'en', enabled = true, scheduled = false, count = 0;
  const tracked = new WeakMap();
  const words = {
    en: { why: 'Why?', review: 'Open full check', flag: 'Flag', flagged: 'Flagged', local: 'Local check · no AI used', media: 'Media not yet checked', noSigns: 'No obvious signs in the text. This does not guarantee safety.', unknown: 'There is not enough text to assess this post.', opening: 'Opening…', failed: 'Start Nova with npm start, then try again.', saved: 'Saved privately for review. No platform report was submitted.', origin: 'Media origin unverified' },
    ur: { why: 'کیوں؟', review: 'مکمل جانچ کھولیں', flag: 'محفوظ کریں', flagged: 'محفوظ ہے', local: 'مقامی جانچ · اے آئی استعمال نہیں ہوا', media: 'میڈیا ابھی چیک نہیں ہوا', noSigns: 'متن میں واضح نشانیاں نہیں ملیں۔ یہ حفاظت کی ضمانت نہیں ہے۔', unknown: 'اس پوسٹ کی جانچ کے لیے متن کافی نہیں ہے۔', opening: 'کھل رہا ہے…', failed: 'Nova بیک اینڈ شروع کریں اور دوبارہ کوشش کریں۔', saved: 'ذاتی جائزے کے لیے محفوظ ہے۔ پلیٹ فارم کو رپورٹ نہیں بھیجی گئی۔', origin: 'میڈیا کے اصل ہونے کی تصدیق نہیں ہوئی' }
  };
  const style = `:host{display:block!important;clear:both!important;margin:12px 0!important;font-family:Arial,sans-serif!important;font-size:12px!important;line-height:1.5!important;color:#314734!important}*{box-sizing:border-box}.wrap{border:1px solid #dce5d5;border-radius:10px;background:#f6f9ef;padding:10px 12px}.line{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mark{font-weight:bold;font-size:10px;letter-spacing:1px;color:#789363}.symbol{height:20px;width:20px;display:grid;place-items:center;border-radius:50%;background:#e2edce;color:#526f3e;font-weight:bold}.title{font-size:11px;flex:1;min-width:100px;font-weight:600}.high{background:#fff2eb;border-color:#efcfbf}.high .symbol{background:#f6d7c7;color:#ab5035}.caution{background:#fcf7e7;border-color:#e9ddb8}.caution .symbol{background:#eee1b6;color:#97752a}.unknown{background:#f4f5f1;border-color:#e0e3d9}.unknown .symbol{background:#e5e8df;color:#7b8770}button{font:inherit;cursor:pointer;border:1px solid #d6dfce;background:#fff;color:#53694a;border-radius:5px;padding:5px 8px;min-height:30px;font-size:10px}button:hover{background:#e8f0dc}button:focus-visible{outline:3px solid #be8a55;outline-offset:2px}button:disabled{opacity:.6;cursor:wait}.review{background:#294e3a;color:white;border-color:#294e3a}.review:hover{background:#3a634b}.details{padding-top:10px;font-size:11px;color:#738268}.details p{margin:5px 0;overflow-wrap:anywhere}.details ul{padding-inline-start:18px;margin:7px 0}.details small{font-size:9px}.status{font-size:10px;margin-top:7px;color:#927341}[hidden]{display:none!important}`;
  function el(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
  function postKey(post) { const source = post.permalink || post.text; let hash = 2166136261; for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619); return `${post.platform}:${hash >>> 0}`; }
  function render(element, post, existing) {
    const result = NovaRules.scan({ ...post, language }), w = words[language];
    const host = existing?.host || el('div'); host.dataset.novaHost = '';
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' }); root.replaceChildren();
    const sheet = el('style', style), wrap = el('div', '', `wrap ${result.risk}`); wrap.dir = language === 'ur' ? 'rtl' : 'ltr';
    const line = el('div', '', 'line');
    line.append(el('span', 'NOVA', 'mark'), el('span', result.risk === 'low' ? '✓' : result.risk === 'unknown' ? '?' : '!', 'symbol'), el('span', result.headline, 'title'));
    const why = el('button', w.why), review = el('button', w.review, 'review'), flag = el('button', w.flag);
    why.type = review.type = flag.type = 'button'; why.setAttribute('aria-expanded', 'false');
    const details = el('div', '', 'details'); details.hidden = true; details.append(el('small', w.local));
    if (result.reasons.length) { const list = el('ul'); result.reasons.forEach(reason => list.append(el('li', `${reason.title}. ${reason.detail}`))); details.append(list, el('p', result.action)); }
    else details.append(el('p', result.risk === 'unknown' ? w.unknown : w.noSigns));
    if (post.hasMedia) details.append(el('p', `${w.media}. ${w.origin}.`));
    const status = el('div', '', 'status'); status.setAttribute('role', 'status');
    why.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); details.hidden = !details.hidden; why.setAttribute('aria-expanded', String(!details.hidden)); });
    review.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation(); if (!event.isTrusted) return;
      review.disabled = true; review.textContent = w.opening; status.textContent = '';
      try { const response = await chrome.runtime.sendMessage({ type: 'NOVA_REVIEW', post }); if (!response?.ok) throw new Error(response?.error || w.failed); }
      catch (error) { status.textContent = error.message || w.failed; }
      finally { review.disabled = false; review.textContent = w.review; }
    });
    flag.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation(); if (!event.isTrusted) return;
      try { const saved = await chrome.storage.local.get('flags'); const flags = Array.isArray(saved.flags) ? saved.flags : []; const key = postKey(post); const next = [{ key, platform: post.platform, headline: result.headline, date: new Date().toISOString() }, ...flags.filter(f => f.key !== key)].slice(0, 40); await chrome.storage.local.set({ flags: next }); flag.textContent = w.flagged; status.textContent = w.saved; }
      catch { status.textContent = 'Could not save this flag.'; }
    });
    line.append(why, review, flag); wrap.append(line, details, status); root.append(sheet, wrap);
    if (!existing) element.append(host);
    tracked.set(element, { host, fingerprint: JSON.stringify({ text: post.text, media: post.media, language }) });
  }
  function scan() {
    scheduled = false;
    if (!enabled) { document.querySelectorAll('[data-nova-host]').forEach(node => node.remove()); count = 0; return; }
    const posts = NovaAdapters.findPosts(document, adapter).slice(-120); count = posts.length;
    for (const element of posts) {
      const post = NovaAdapters.extractPost(element, adapter); const old = tracked.get(element);
      const existing = old?.host.isConnected ? old : null;
      const fingerprint = JSON.stringify({ text: post.text, media: post.media, language });
      if (!existing || existing.fingerprint !== fingerprint) render(element, post, existing);
    }
  }
  function schedule() { if (scheduled) return; scheduled = true; setTimeout(scan, 350); }
  globalThis.__novaScan = scan;
  const ready = chrome.storage.local.get(['enabled', 'language']).then(settings => { enabled = settings.enabled !== false; language = settings.language === 'ur' ? 'ur' : 'en'; scan(); });
  const observer = new MutationObserver(schedule); observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-view-name', 'data-id', 'data-urn', 'class'] });
  // Media can load after its post is inserted, without another DOM mutation.
  document.addEventListener('load', event => { if (event.target instanceof HTMLImageElement || event.target instanceof HTMLVideoElement) schedule(); }, true);
  chrome.storage.onChanged.addListener((changes, area) => { if (area !== 'local') return; if (changes.enabled) enabled = changes.enabled.newValue !== false; if (changes.language) language = changes.language.newValue === 'ur' ? 'ur' : 'en'; scan(); });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'NOVA_SCAN') {
      ready.then(() => { scan(); sendResponse({ count, platform: adapter.name, enabled }); });
      return true;
    }
  });
})();
