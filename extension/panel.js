(() => {
  if (globalThis.VerifeedPanel) return;
  let active = null;
  function open(post, language = 'en') {
    if (active) { active.dialog.focus(); return; }
    const previous = document.activeElement;
    const host = document.createElement('div'); host.dataset.verifeedPanel = '';
    const root = host.attachShadow({ mode: 'open' });
    const sheet = document.createElement('style');
    sheet.textContent = ':host{all:initial}*{box-sizing:border-box}dialog{position:fixed;inset:0;margin:auto;width:min(520px,calc(100vw - 24px));height:min(780px,calc(100dvh - 32px));max-height:calc(100dvh - 32px);max-width:none;padding:0;border:1px solid #d9e1d4;border-radius:16px;background:#fafbf7;color:#274837;box-shadow:0 20px 100px #10251955;font:14px Arial,sans-serif;overflow:hidden}dialog[open]{display:flex;flex-direction:column}dialog::backdrop{background:#14251c55}header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e3e8de;flex:none;background:#fafbf7}strong{font-size:20px;letter-spacing:-.6px}small{font-size:11px;margin-inline-start:10px;color:#73836b}button{border:0;border-radius:50%;background:#ecf0e7;color:#344d3e;width:36px;height:36px;font:26px Arial;cursor:pointer}button:hover{background:#dfe8d8}button:focus-visible{outline:3px solid #ad7c48;outline-offset:2px}iframe{border:0;width:100%;flex:1;min-height:0;background:#fafbf7}.message{padding:24px;line-height:1.6}';
    const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', language === 'ur' ? 'Verifeed پوسٹ کا جائزہ' : 'Verifeed post review'); dialog.tabIndex = -1;
    const header = document.createElement('header'), label = document.createElement('div');
    const brand = document.createElement('strong'); brand.textContent = 'verifeed.';
    const subtitle = document.createElement('small'); subtitle.textContent = language === 'ur' ? 'پوسٹ کا جائزہ' : 'POST REVIEW'; label.append(brand, subtitle);
    const close = document.createElement('button'); close.type = 'button'; close.className = 'close'; close.textContent = '×'; close.setAttribute('aria-label', language === 'ur' ? 'جائزہ بند کریں' : 'Close review');
    const message = document.createElement('p'); message.className = 'message'; message.setAttribute('role', 'status'); message.textContent = language === 'ur' ? 'جائزہ کھل رہا ہے…' : 'Opening your review…';
    header.append(label, close); dialog.append(header, message); root.append(sheet, dialog); document.documentElement.append(host);
    active = { dialog, host };
    // Only this explicit control closes the review. No backdrop or Escape dismissal.
    dialog.addEventListener('cancel', event => event.preventDefault());
    for (const type of ['click', 'pointerdown', 'keydown']) dialog.addEventListener(type, event => event.stopPropagation());
    close.addEventListener('click', event => {
      if (!event.isTrusted) return;
      dialog.close(); host.remove(); active = null;
      if (previous?.isConnected) previous.focus();
    });
    dialog.showModal(); close.focus();
    chrome.runtime.sendMessage({ type: 'VERIFEED_PANEL_START', post, language }).then(response => {
      if (!host.isConnected) return;
      if (!response?.ok) throw new Error(response?.error || 'Could not open this review. Reload Verifeed and try again.');
      const frame = document.createElement('iframe'); frame.title = 'Verifeed analysis'; frame.src = chrome.runtime.getURL(`review.html#${response.id}`); message.replaceWith(frame);
    }).catch(error => { if (host.isConnected) message.textContent = error.message; });
  }
  globalThis.VerifeedPanel = Object.freeze({ open });
})();
