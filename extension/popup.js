const $ = selector => document.querySelector(selector);
let language = 'en';
const copy = {
  en: { heading: 'A second look, right beside the post.', intro: 'Instant warning signs. A clearer next step.', toggle: 'Automatic local checks', hint: 'No AI calls while you scroll.', scan: 'Scan this feed ↗', studio: 'Open review studio ↗', practice: 'Open the practice feed ↗', flags: 'Your private flags', none: 'No flagged posts yet.', delete: 'Delete', unsupported: 'Open X, Facebook, Instagram, LinkedIn, or the practice feed. You can also right-click selected text to review it.', noPosts: 'No supported posts found. Scroll the feed or select text and right-click to review it.', off: 'Local checks are paused. Turn them on to show badges.' },
  ur: { heading: 'پوسٹ کے ساتھ ایک اور نظر۔', intro: 'فوری نشانیاں۔ واضح اگلا قدم۔', toggle: 'خودکار مقامی جانچ', hint: 'اسکرول کے دوران اے آئی استعمال نہیں ہوتا۔', scan: 'فیڈ چیک کریں ↗', studio: 'جائزے کی جگہ کھولیں ↗', practice: 'مشق کی فیڈ کھولیں ↗', flags: 'آپ کے ذاتی نشان', none: 'ابھی کوئی پوسٹ محفوظ نہیں ہے۔', delete: 'حذف', unsupported: 'X، فیس بک، انسٹاگرام یا لنکڈ ان کی فیڈ کھولیں۔ متن منتخب کر کے دایاں کلک بھی کر سکتے ہیں۔', noPosts: 'کوئی پوسٹ نہیں ملی۔ فیڈ اسکرول کریں یا متن منتخب کر کے دایاں کلک کریں۔', off: 'مقامی جانچ بند ہے۔ نشانیاں دیکھنے کے لیے اسے فعال کریں۔' }
};
async function render() {
  const w = copy[language]; document.documentElement.lang = language; document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';
  $('#language').value = language; $('#heading').textContent = w.heading; $('#intro').textContent = w.intro; $('#toggle-label').textContent = w.toggle; $('#hint').textContent = w.hint; $('#scan').textContent = w.scan; $('#studio').textContent = w.studio; $('#practice').textContent = w.practice; $('#flags-label').textContent = w.flags;
  const settings = await chrome.storage.local.get(['flags', 'enabled']); $('#enabled').checked = settings.enabled !== false;
  const flags = Array.isArray(settings.flags) ? settings.flags : [], list = $('#flags'); list.replaceChildren();
  if (!flags.length) list.textContent = w.none;
  for (const flag of flags) { const row = document.createElement('div'), label = document.createElement('span'), button = document.createElement('button'); label.textContent = `${flag.platform} · ${flag.headline}`; button.textContent = w.delete; button.addEventListener('click', async () => { const latest = await chrome.storage.local.get('flags'); await chrome.storage.local.set({ flags: (latest.flags || []).filter(f => f.key !== flag.key) }); render(); }); row.append(label, button); list.append(row); }
}
$('#language').addEventListener('change', async () => { language = $('#language').value; await chrome.storage.local.set({ language }); render(); });
$('#enabled').addEventListener('change', () => chrome.storage.local.set({ enabled: $('#enabled').checked }));
$('#studio').addEventListener('click', () => chrome.tabs.create({ url: 'http://127.0.0.1:4317/' }));
$('#scan').addEventListener('click', async () => {
  $('#scan').disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url || 'about:blank');
    if (!['x.com', 'twitter.com', 'www.facebook.com', 'www.instagram.com', 'www.linkedin.com', '127.0.0.1', 'localhost'].includes(url.hostname)) { $('#status').textContent = copy[language].unsupported; return; }
    try { await chrome.tabs.sendMessage(tab.id, { type: 'NOVA_SCAN' }); }
    catch { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shared/rules.js', 'adapters.js', 'content.js'] }); }
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'NOVA_SCAN' });
    $('#status').textContent = !response.enabled ? copy[language].off : response.count ? (language === 'ur' ? `${response.count} پوسٹس چیک ہوئیں۔ اے آئی استعمال نہیں ہوا۔` : `${response.count} posts checked. No AI calls used.`) : copy[language].noPosts;
  } catch { $('#status').textContent = copy[language].unsupported; }
  finally { $('#scan').disabled = false; }
});
chrome.storage.local.get('language').then(async settings => { language = settings.language === 'ur' ? 'ur' : 'en'; await render(); const last = await chrome.storage.session.get('lastError'); if (last.lastError) { $('#status').textContent = last.lastError; await chrome.storage.session.remove('lastError'); } await chrome.action.setBadgeText({ text: '' }); });
