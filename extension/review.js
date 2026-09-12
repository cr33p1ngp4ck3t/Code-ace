import { getBackend, backendRequest } from './backend.js';
import { prepareFile } from './shared/media.js';
import './shared/website.js';
const $ = selector => document.querySelector(selector);
let post, language = 'en', media = null, notes = [], result, busy = true, speaking = false;
const words = {
  en: { local: 'Local patterns · no AI used', ai: 'AI-assisted review', cached: 'Recent result reused', analyze: 'Analyze with AI', analyzing: 'Analyzing this post…', preparing: 'Preparing media on this device…', preview: 'Selected post', scam: 'SCAM WARNING SIGNS', listen: 'Listen', stop: 'Stop', flag: 'Flag', flagged: 'Flagged privately', upload: 'Include a file', consent: 'Only Analyze with AI sends this selected content to Groq.', dismiss: 'This review stays open until you press ×.', noSigns: 'No obvious warning signs in the supplied text. This does not guarantee safety.', noVoice: 'No matching voice is installed on this device.', mediaMissing: 'The attachment has not been inspected. Include the original file to check it.', origin: 'Media origin and speaker identity remain unverified.', caption: 'Post text', image: 'image(s)', frames: 'sampled video frames', speech: 'seconds of speech', evidence: 'Media evidence', connection: 'Could not connect. Check Server connection in Verifeed’s toolbar popup.' },
  ur: { local: 'مقامی نشانیاں · اے آئی استعمال نہیں ہوا', ai: 'اے آئی کی مدد سے جائزہ', cached: 'حالیہ نتیجہ دوبارہ دکھایا گیا', analyze: 'اے آئی سے جانچیں', analyzing: 'پوسٹ چیک ہو رہی ہے…', preparing: 'میڈیا اس آلے پر تیار ہو رہا ہے…', preview: 'منتخب پوسٹ', scam: 'دھوکے کی نشانیاں', listen: 'سنیں', stop: 'روکیں', flag: 'محفوظ کریں', flagged: 'ذاتی طور پر محفوظ', upload: 'فائل شامل کریں', consent: 'صرف اے آئی جانچ کا بٹن یہ منتخب مواد Groq کو بھیجتا ہے۔', dismiss: 'یہ جائزہ صرف × دبانے سے بند ہوگا۔', noSigns: 'متن میں واضح نشانیاں نہیں ملیں۔ یہ حفاظت کی ضمانت نہیں۔', noVoice: 'اس آلے پر اس زبان کی آواز موجود نہیں۔', mediaMissing: 'منسلک میڈیا چیک نہیں ہوا۔ جانچنے کے لیے اصل فائل شامل کریں۔', origin: 'میڈیا کے اصل ہونے یا بولنے والے کی شناخت کی تصدیق نہیں ہوئی۔', caption: 'پوسٹ کا متن', image: 'تصاویر', frames: 'منتخب ویڈیو فریم', speech: 'سیکنڈ کی آواز', evidence: 'میڈیا کی تفصیل', connection: 'کنکشن نہیں ہوا۔ Verifeed کے پاپ اپ میں سرور کا پتہ چیک کریں۔' }
};
const w = key => words[language][key];
function node(tag, text, className) { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; }
function fileFrom(item) { const [prefix, data] = item.dataUrl.split(','); return new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))], item.name, { type: prefix.slice(5).split(';')[0] }); }
function snapshot() { return { text: post.text, links: post.links, language, context: post.context || 'post', kind: media?.kind || 'text', images: media?.images || [], audio: media?.audio || null, hasMedia: Boolean(post.hasMedia || media), notes: [...notes, ...(media?.notes || [])].slice(0, 4) }; }
function localResult() { const input = snapshot(); return { ...(input.context === 'website' ? VerifeedWebsite.scan(input) : NovaRules.scan(input)), writing: VerifeedWriting.scan(input.text, language) }; }
function displayReasons(target, reasons) {
  target.replaceChildren();
  for (const reason of reasons) {
    const item = node('div', '', 'reason'); item.append(node('strong', reason.title), node('p', reason.detail));
    if (reason.evidence) item.append(node('blockquote', reason.evidence)); target.append(item);
  }
}
function render() {
  $('#status').textContent = busy ? w('preparing') : result.source === 'ai' ? w(result.cached ? 'cached' : 'ai') : w('local');
  $('#scam').hidden = $('#writing').hidden = false;
  $('#scam').className = result.risk; $('#risk-title').textContent = result.headline;
  displayReasons($('#reasons'), result.reasons);
  if (!result.reasons.length) $('#reasons').append(node('p', w('noSigns'), 'note'));
  $('#action').textContent = result.action;
  const writing = result.writing || VerifeedWriting.scan(post.text, language);
  $('#writing').className = writing.status; $('#writing-result').textContent = writing.headline;
  displayReasons($('#writing-signals'), writing.signals); $('#writing-note').textContent = writing.limitation;
  const coverage = result.coverage;
  const parts = coverage ? [coverage.text ? w('caption') : '', coverage.images ? `${coverage.images} ${w('image')}` : '', coverage.videoFrames ? `${coverage.videoFrames} ${w('frames')}` : '', coverage.audioSeconds ? `${Math.round(coverage.audioSeconds)} ${w('speech')}` : ''].filter(Boolean) : [];
  const unchecked = snapshot().hasMedia && (!coverage || coverage.mediaUnchecked);
  $('#coverage').textContent = [...parts, ...(result.notes || notes), unchecked ? w('mediaMissing') : '', snapshot().hasMedia ? w('origin') : ''].filter(Boolean).join(' · ');
  const evidence = [result.transcript, result.observations?.visibleText, ...(result.observations?.details || [])].filter(Boolean).join('\n\n');
  $('#observations').hidden = !evidence; $('#observations p').textContent = evidence;
  $('#analyze').disabled = busy || (!post.text.trim() && !media); $('#analyze').textContent = w('analyze');
  $('#listen').hidden = $('#flag').hidden = false;
}
async function attach(file) {
  busy = true; $('#error').textContent = ''; render();
  try {
    media = await prepareFile(file); const preview = $('#media-preview'); preview.replaceChildren();
    for (const image of media.images) { const img = node('img'); img.src = image.dataUrl; img.alt = image.seconds == null ? file.name : `${image.seconds}s`; preview.append(img); }
    if (media.audio) { const audio = node('audio'); audio.src = media.audio.dataUrl; audio.controls = true; preview.append(audio); }
    $('#preview').open = true;
  } catch (error) { media = null; $('#error').textContent = error.message; }
  finally { busy = false; result = localResult(); render(); }
}
function stopSpeech() { if (speaking) speechSynthesis.cancel(); speaking = false; $('#listen').textContent = w('listen'); }
$('#analyze').addEventListener('click', async event => {
  if (!event.isTrusted || busy || !post) return;
  stopSpeech(); busy = true; $('#error').textContent = ''; $('#analyze').disabled = true; $('#analyze').textContent = $('#status').textContent = w('analyzing');
  try { const backend = await getBackend(); result = await backendRequest(backend, '/api/analyze', snapshot()); }
  catch (error) { $('#error').textContent = error.message || w('connection'); }
  finally { busy = false; render(); }
});
$('#file').addEventListener('change', event => { if (!busy && event.target.files[0]) { notes = []; attach(event.target.files[0]); } });
$('#listen').addEventListener('click', () => {
  if (speaking) { stopSpeech(); return; }
  if (!globalThis.speechSynthesis) { $('#error').textContent = w('noVoice'); return; }
  const voice = speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith(language));
  if (!voice && language === 'ur') { $('#error').textContent = w('noVoice'); return; }
  const utterance = new SpeechSynthesisUtterance([result.headline, ...result.reasons.map(reason => reason.detail), result.action, result.writing?.headline, result.writing?.limitation].filter(Boolean).join('. '));
  if (voice) utterance.voice = voice; utterance.lang = language === 'ur' ? 'ur-PK' : 'en-US'; utterance.rate = .9;
  utterance.onend = () => { speaking = false; $('#listen').textContent = w('listen'); }; utterance.onerror = () => { stopSpeech(); $('#error').textContent = w('noVoice'); };
  speaking = true; $('#listen').textContent = w('stop'); speechSynthesis.speak(utterance);
});
$('#flag').addEventListener('click', async () => {
  try {
    const saved = await chrome.storage.local.get('flags'), flags = Array.isArray(saved.flags) ? saved.flags : [];
    let hash = 2166136261; for (const char of post.permalink || post.text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const key = `${post.platform}:${hash >>> 0}`;
    await chrome.storage.local.set({ flags: [{ key, platform: post.platform, headline: result.headline, date: new Date().toISOString() }, ...flags.filter(flag => flag.key !== key)].slice(0, 40) });
    $('#flag').textContent = w('flagged');
  } catch (error) { $('#error').textContent = error.message; }
});
addEventListener('pagehide', stopSpeech);
try {
  const id = location.hash.slice(1); history.replaceState(null, '', 'review.html');
  const response = await chrome.runtime.sendMessage({ type: 'VERIFEED_PANEL_CLAIM', id });
  if (!response?.ok) throw new Error(response?.error || 'This review expired. Close it with × and open the post again.');
  post = response.post; language = response.language === 'ur' ? 'ur' : 'en'; notes = response.notes || [];
  document.documentElement.lang = language; document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';
  $('#preview').hidden = $('#upload-label').hidden = false; $('#preview-title').textContent = w('preview'); $('#post-text').textContent = post.text;
  $('#scam-title').textContent = w('scam'); $('#writing-title').textContent = VerifeedWriting.copy[language].title;
  for (const id of ['listen', 'flag', 'consent']) $(`#${id}`).textContent = w(id);
  $('#dismiss-note').textContent = w('dismiss'); $('#upload-label span').textContent = w('upload'); $('#observations summary').textContent = w('evidence');
  busy = false; result = localResult(); render();
  if (response.file) await attach(fileFrom(response.file));
} catch (error) { $('#status').textContent = ''; $('#error').textContent = error.message; }
