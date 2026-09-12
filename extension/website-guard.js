(() => {
  if (globalThis.__verifeedWebsiteGuardLoaded || window !== top) return;
  globalThis.__verifeedWebsiteGuardLoaded = true;
  let language = 'en', closed = false, host = null, observer, timer, deadlineTimer, lastText = '', settingsReady = false, attempts = 0;
  const skip = 'script,style,noscript,template,input,textarea,select,option,form,[contenteditable],[role="textbox"],[hidden],[aria-hidden="true"],[data-nova-host],[data-verifeed-panel],[data-verifeed-site-warning]';
  const copy = {
    en: { redirected: 'AFTER A REDIRECT', high: 'This site may be unsafe', caution: 'Pause before continuing', writing: 'AI-style writing noticed', review: 'Review this page', close: 'Dismiss website warning', local: 'Local text check · no AI used', limit: 'Visible text only. Site reputation and media have not been verified.', writingNote: 'Formulaic writing is not proof of AI authorship or an unsafe website.' },
    ur: { redirected: 'ری ڈائریکٹ کے بعد', high: 'یہ سائٹ غیر محفوظ ہو سکتی ہے', caution: 'آگے بڑھنے سے پہلے رکیں', writing: 'اے آئی جیسے انداز کی نشانیاں', review: 'صفحے کا جائزہ', close: 'ویب سائٹ کا انتباہ بند کریں', local: 'مقامی متن کی جانچ · اے آئی استعمال نہیں ہوا', limit: 'صرف نظر آنے والا متن۔ سائٹ کی ساکھ اور میڈیا کی تصدیق نہیں ہوئی۔', writingNote: 'تحریر کا انداز اے آئی مصنف یا غیر محفوظ ویب سائٹ کا ثبوت نہیں۔' }
  };
  const style = ':host{all:initial!important;position:fixed!important;left:16px!important;bottom:20px!important;width:min(310px,calc(100vw - 32px))!important;z-index:2147483646!important;font:13px/1.5 Arial,sans-serif!important;color:#344838!important}*{box-sizing:border-box}.card{background:#fafbf7;border:1px solid #d7e1ce;border-left:4px solid #b36944;border-radius:12px;padding:15px;box-shadow:0 10px 40px #18311d30;max-height:calc(100dvh - 40px);overflow:auto}.writing{border-left-color:#886caa}.top{display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{font-weight:700;font-size:15px;letter-spacing:-.5px}.close{border:0;background:transparent;color:#627355;font-size:23px;line-height:1;width:30px;height:30px;cursor:pointer}.eyebrow{font-size:9px;letter-spacing:.8px;color:#829173;margin-top:8px}h2{font-size:16px;line-height:1.35;margin:5px 0 10px;color:#914b31}.writing h2{color:#775492}.domain{font-size:11px;color:#74846a;overflow-wrap:anywhere;margin:5px 0}p{margin:7px 0;font-size:12px;overflow-wrap:anywhere}.note{font-size:10px;color:#819073}.review{border:1px solid #cfdbc5;border-radius:7px;padding:8px 11px;min-height:36px;background:#edf3e6;color:#3e5e32;font:12px Arial;cursor:pointer;margin-top:6px}button:focus-visible{outline:3px solid #a87946;outline-offset:2px}blockquote{margin:8px 0;padding-inline-start:9px;border-inline-start:2px solid #e1d9cc;font-size:11px;color:#748267;overflow-wrap:anywhere}';
  function node(tag, text, className) { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; }
  function pageText() {
    const scope = document.querySelector('main,[role="main"],article') || document.body;
    if (!scope) return '';
    const walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT); const parts = []; let length = 0, visited = 0;
    while (walk.nextNode() && length < 6000 && visited++ < 2500) {
      const parent = walk.currentNode.parentElement;
      if (!parent || parent.closest(skip) || !parent.getClientRects().length) continue;
      const computed = getComputedStyle(parent); if (computed.visibility !== 'visible' || computed.display === 'none') continue;
      const text = walk.currentNode.textContent.replace(/\s+/gu, ' ').trim();
      if (text) { parts.push(text); length += text.length + 1; }
    }
    return parts.join('\n').slice(0, 6000);
  }
  function stop() { observer?.disconnect(); clearTimeout(timer); clearTimeout(deadlineTimer); }
  function dismiss() { closed = true; stop(); host?.remove(); }
  function scan() {
    if (closed || !settingsReady || attempts++ >= 24) return;
    const text = pageText(); if (!text || text === lastText) return; lastText = text;
    const result = VerifeedWebsite.scan({ text, language });
    if (!result.warningKind) return;
    const w = copy[language];
    if (!host) { host = node('div'); host.dataset.verifeedSiteWarning = ''; host.attachShadow({ mode: 'open' }); document.documentElement.append(host); }
    const card = node('aside', '', `card ${result.warningKind}`); card.dir = language === 'ur' ? 'rtl' : 'ltr'; card.setAttribute('role', 'status');
    const header = node('div', '', 'top'), close = node('button', '×', 'close'); close.type = 'button'; close.setAttribute('aria-label', w.close);
    close.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (event.isTrusted) dismiss(); });
    header.append(node('span', 'verifeed.', 'brand'), close);
    card.append(header, node('div', w.redirected, 'eyebrow'), node('h2', w[result.warningKind]), node('p', location.hostname, 'domain'));
    const reason = result.warningKind === 'writing' ? result.writing.signals[0] : result.reasons[0];
    if (reason) card.append(node('p', reason.title), node('blockquote', reason.evidence));
    card.append(node('p', result.warningKind === 'writing' ? w.writingNote : result.action));
    const review = node('button', w.review, 'review'); review.type = 'button';
    review.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation(); if (!event.isTrusted) return;
      VerifeedPanel.open({ text: pageText(), links: [], media: [], hasMedia: Boolean(document.querySelector('main img,main video,article img,article video')), platform: location.hostname, permalink: location.origin, context: 'website' }, language);
    });
    card.append(review, node('p', w.local, 'note'), node('p', w.limit, 'note'));
    host.shadowRoot.replaceChildren(node('style', style), card);
  }
  function schedule() { clearTimeout(timer); if (!closed) timer = setTimeout(scan, 700); }
  function start() {
    if (closed || !settingsReady || !document.body) return;
    scan(); observer = new MutationObserver(schedule); observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    // Bound work on long-lived or continuously updating pages.
    deadlineTimer = setTimeout(stop, 20000);
  }
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.websiteGuard?.newValue === false) dismiss(); });
  chrome.storage.local.get(['websiteGuard', 'language']).then(settings => {
    if (!settings.websiteGuard) return; language = settings.language === 'ur' ? 'ur' : 'en'; settingsReady = true;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  });
})();
