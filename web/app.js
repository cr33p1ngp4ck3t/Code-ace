import { prepareFile, samplePoster } from './lib/media.js';
import { copy } from './lib/i18n.js';

const $ = selector => document.querySelector(selector);
const state = { language: readStorage('nova-language', 'en') === 'ur' ? 'ur' : 'en', kind: 'text', media: null, sourceNotes: [], links: [], hasMedia: false, result: null, busy: false, savedResult: false, speaking: false };
const t = key => copy[state.language][key] || copy.en[key] || key;
const symbols = { low: '✓', caution: '!', high: '!', unknown: '?' };
function readStorage(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeStorage(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast('Storage is unavailable on this device.'); return false; } }
function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function message(text = '') { $('#input-message').textContent = text; $('#input-message').hidden = !text; }
function setBusy(busy) {
  state.busy = busy; $('#input-panel').setAttribute('aria-busy', String(busy));
  for (const element of document.querySelectorAll('.composer button, .composer input, .composer textarea, #language, .type-tabs button')) element.disabled = busy;
}
function stopSpeech() { globalThis.speechSynthesis?.cancel(); state.speaking = false; const button = $('#listen-result'); if (button) button.textContent = `♫ ${t('listen')}`; }
function invalidate() { stopSpeech(); state.result = null; state.savedResult = false; renderResult(); }
function inputSnapshot() {
  return { text: $('#content').value, links: state.links, kind: state.media?.kind || state.kind, images: state.media?.images || [], audio: state.media?.audio || null, notes: [...state.sourceNotes, ...(state.media?.notes || [])].slice(0, 4), hasMedia: Boolean(state.media || state.hasMedia), language: state.language };
}
function setKind(kind) {
  state.kind = kind;
  for (const tab of document.querySelectorAll('[data-kind]')) { const active = tab.dataset.kind === kind; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; }
  $('#input-panel').setAttribute('aria-labelledby', `tab-${kind}`);
  $('#dropzone').hidden = kind === 'text' || Boolean(state.media);
  $('#file').accept = kind === 'image' ? 'image/jpeg,image/png,image/webp' : kind === 'audio' ? 'audio/*' : 'video/mp4,video/webm,video/quicktime';
  renderExamples();
}
function updateCount() { $('#char-count').textContent = `${$('#content').value.length.toLocaleString()} / 6,000`; }
function clearContent() {
  $('#content').value = ''; $('#file').value = ''; state.media = null; state.links = []; state.sourceNotes = []; state.hasMedia = false;
  message(); updateCount(); renderMedia(); invalidate();
}
function renderExamples() {
  const examples = $('#examples'); examples.replaceChildren();
  const items = state.kind === 'text' ? [['sampleScam', 'scam'], ['sampleNormal', 'normal']] : [[`sample${state.kind[0].toUpperCase()}${state.kind.slice(1)}`, state.kind]];
  for (const [key, sample] of items) { const button = node('button', `${t(key)} ↗`); button.type = 'button'; button.disabled = state.busy; button.addEventListener('click', () => loadExample(sample)); examples.append(button); }
}
async function loadExample(kind) {
  if (state.busy) return;
  clearContent();
  if (kind === 'scam' || kind === 'normal') {
    $('#content').value = kind === 'scam' ? (state.language === 'ur' ? 'گھر بیٹھے نوکری حاصل کریں۔ انٹرن شپ کے لیے رجسٹریشن فیس 2500 روپے پہلے دیں۔ فوری درخواست دیں۔' : 'We are hiring! Guaranteed remote internship, no interview needed. Pay a registration fee of PKR 2,500 today to reserve your place. Apply immediately.') : (state.language === 'ur' ? 'آج دوستوں کے ساتھ پارک میں چہل قدمی کی۔ موسم بہت اچھا تھا۔' : 'A quiet Saturday at the park with friends. Good coffee, a long walk, and absolutely no plans.');
    updateCount(); message(t('sampleNotice')); return;
  }
  setBusy(true);
  try {
    let file;
    if (kind === 'image') file = await samplePoster();
    else {
      const response = await fetch(`/assets/sample-${kind}.${kind === 'audio' ? 'wav' : 'webm'}`);
      if (!response.ok) throw new Error('This practice file is not available. Upload your own clip.');
      file = new File([await response.blob()], `practice-${kind}.${kind === 'audio' ? 'wav' : 'webm'}`, { type: kind === 'audio' ? 'audio/wav' : 'video/webm' });
    }
    await attachFile(file);
    message(t('sampleNotice'));
  } catch (error) { message(error.message); }
  finally { setBusy(false); }
}
async function attachFile(file) {
  invalidate(); setBusy(true); message(t('preparing'));
  try { state.media = await prepareFile(file); state.hasMedia = true; setKind(state.media.kind); renderMedia(); message(); }
  catch (error) { state.media = null; renderMedia(); message(error.message); }
  finally { setBusy(false); }
}
function renderMedia() {
  const preview = $('#media-preview'); preview.replaceChildren(); preview.hidden = !state.media; $('#dropzone').hidden = state.kind === 'text' || Boolean(state.media);
  if (!state.media) return;
  const card = node('div', undefined, 'media-card'), header = node('div', undefined, 'media-card-head');
  header.append(node('strong', state.media.name));
  const remove = node('button', `× ${t('remove')}`, 'text-button'); remove.type = 'button'; remove.addEventListener('click', () => { if (state.busy) return; state.media = null; state.hasMedia = Boolean(state.sourceNotes.length); $('#file').value = ''; renderMedia(); invalidate(); });
  header.append(remove); card.append(header, node('small', t('preview')));
  if (state.media.images.length) {
    const images = node('div', undefined, 'media-thumbnails');
    for (const image of state.media.images) { const figure = node('figure'); const img = node('img'); img.src = image.dataUrl; img.alt = image.seconds === null ? state.media.name : `Video frame at ${image.seconds} seconds`; figure.append(img); if (image.seconds !== null) figure.append(node('figcaption', `${image.seconds}s`)); images.append(figure); }
    card.append(images);
  }
  if (state.media.audio) { const audio = node('audio'); audio.controls = true; audio.src = state.media.audio.dataUrl; audio.setAttribute('aria-label', state.media.name); card.append(audio); }
  if (state.media.notes.length) { const notes = node('ul'); for (const note of state.media.notes) notes.append(node('li', note)); card.append(notes); }
  card.append(node('small', t('selectedOnly'))); preview.append(card);
}
function renderResult(loading = false) {
  const panel = $('#result-panel'); panel.replaceChildren(); panel.className = 'result-panel panel'; panel.setAttribute('aria-busy', String(loading));
  if (!state.result || loading) {
    const empty = node('div', undefined, 'empty-result');
    empty.append(node('div', loading ? '' : '◇', loading ? 'loading-ring' : 'empty-icon'), node('h2', loading ? t('analyzing') : t('waiting')), node('p', loading ? t('selectedOnly') : t('waitingBody')));
    if (!loading) empty.append(node('p', t('noVerdict'), 'empty-pill'));
    const foot = node('div', undefined, 'result-footnote'); foot.append(node('span', '♧'), node('p', t('private'))); panel.append(empty, foot); return;
  }
  const result = state.result; panel.classList.add(`risk-${result.risk}`);
  const header = node('div', undefined, 'result-header'); header.append(node('p', t('riskLabel'), 'eyebrow'));
  const row = node('div', undefined, 'risk-row'); row.append(node('span', symbols[result.risk], 'risk-symbol'), node('h2', result.headline));
  header.append(row, node('p', `${t(result.source === 'ai' ? 'aiResult' : 'localResult')}${result.cached ? ` · ${t('cached')}` : ''}`, 'risk-source'));
  const body = node('div', undefined, 'result-body'); body.append(node('h3', t('why'), 'section-label'));
  if (!result.reasons.length) body.append(node('p', t(result.risk === 'unknown' && result.coverage.mediaUnchecked ? 'unchecked' : 'noReasons'), 'no-reasons'));
  for (const reason of result.reasons) { const article = node('article', undefined, 'reason'); article.append(node('h3', reason.title), node('p', reason.detail)); if (reason.evidence) article.append(node('blockquote', reason.evidence)); body.append(article); }
  const action = node('div', undefined, 'next-step'); action.append(node('h3', t('next')), node('p', result.action)); body.append(action, node('h3', t('coverage'), 'section-label'));
  const coverage = node('div', undefined, 'coverage'), checked = result.coverage;
  if (checked.text) coverage.append(node('span', `✓ ${t('textChecked')}`));
  if (checked.images) coverage.append(node('span', `✓ ${checked.images} ${t('imagesChecked')}`));
  if (checked.videoFrames) coverage.append(node('span', `✓ ${checked.videoFrames} ${t('framesChecked')}${checked.frameTimes?.length ? ` (${checked.frameTimes.map(time => `${time}s`).join(', ')})` : ''}`));
  if (checked.audioSeconds) coverage.append(node('span', `✓ ${Math.round(checked.audioSeconds)} ${t('secondsChecked')}`));
  if (!checked.images && !checked.videoFrames && !checked.audioSeconds) coverage.append(node('span', t('noMedia')));
  body.append(coverage);
  const notes = [...(result.notes || [])]; if (checked.mediaUnchecked) notes.push(t('unchecked'));
  if (notes.length) { const list = node('ul', undefined, 'coverage-notes'); for (const note of notes) list.append(node('li', note)); body.append(list); }
  if (state.media || state.hasMedia || checked.images || checked.audioSeconds || checked.videoFrames) { const origin = node('p', undefined, 'origin-note'); origin.append(node('strong', t('origin')), document.createTextNode(t('originBody'))); body.append(origin); }
  for (const [key, text] of [['transcript', result.transcript], ['observations', result.observations ? [result.observations.visibleText, ...result.observations.details, result.observations.limitations].filter(Boolean).join('\n\n') : '']]) {
    if (text) { const details = node('details', undefined, 'result-details'); details.append(node('summary', t(key)), node('p', text)); body.append(details); }
  }
  const actions = node('div', undefined, 'result-actions');
  const listen = node('button', `♫ ${t('listen')}`, 'button secondary'); listen.id = 'listen-result'; listen.addEventListener('click', speakResult);
  const save = node('button', `⚑ ${t(state.savedResult ? 'savedAction' : 'save')}`, 'button secondary'); save.disabled = state.savedResult; save.addEventListener('click', saveResult);
  actions.append(listen, save); body.append(actions);
  const foot = node('div', t('feedback'), 'result-footnote'); panel.append(header, body, foot);
}
async function runCheck(ai) {
  if (state.busy) return;
  const input = inputSnapshot();
  if (!input.text.trim() && !state.media) { message(t('noInput')); return; }
  stopSpeech(); state.savedResult = false; state.result = NovaRules.scan(input); message();
  if (!ai) { renderResult(); if (input.hasMedia) message(t('captionOnly')); return; }
  setBusy(true); renderResult(true);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(145000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'This check could not be completed.');
    state.result = data;
  } catch (error) { message(error.name === 'TimeoutError' ? 'The check took too long. The local result is shown below.' : error.message); }
  finally { setBusy(false); renderResult(); }
}
function speakResult() {
  if (state.speaking) { stopSpeech(); return; }
  if (!state.result || !globalThis.speechSynthesis) { toast(t('noVoice')); return; }
  const voices = speechSynthesis.getVoices(), voice = voices.find(v => v.lang.toLowerCase().startsWith(state.language));
  if (!voice && state.language === 'ur') { toast(t('noVoice')); return; }
  const result = state.result;
  const utterance = new SpeechSynthesisUtterance([result.headline, ...result.reasons.map(r => r.detail), result.action].join('. '));
  if (voice) utterance.voice = voice; utterance.lang = state.language === 'ur' ? 'ur-PK' : 'en-US'; utterance.rate = 0.88;
  utterance.onend = stopSpeech; utterance.onerror = () => { stopSpeech(); toast(t('noVoice')); };
  state.speaking = true; $('#listen-result').textContent = `■ ${t('stop')}`; speechSynthesis.speak(utterance);
}
function savedItems() { const items = readStorage('nova-saved', []); return Array.isArray(items) ? items.filter(x => x && typeof x.headline === 'string').slice(0, 40) : []; }
function saveResult() {
  if (!state.result || state.savedResult) return;
  const result = state.result;
  const items = [{ id: crypto.randomUUID(), headline: result.headline, action: result.action, risk: result.risk, date: new Date().toISOString(), language: result.language }, ...savedItems()].slice(0, 40);
  if (writeStorage('nova-saved', items)) { state.savedResult = true; renderResult(); renderSaved(); toast(t('savedAction')); }
}
function renderSaved() {
  const items = savedItems(), list = $('#saved-list'); $('#saved-count').textContent = String(items.length); list.replaceChildren();
  if (!items.length) { list.append(node('div', t('emptySaved'), 'panel empty-saved')); return; }
  for (const item of items) {
    const card = node('article', undefined, 'panel saved-card'), text = node('div'); text.dir = item.language === 'ur' ? 'rtl' : 'ltr';
    text.append(node('h2', `${symbols[item.risk] || '?'} ${item.headline}`), node('p', item.action));
    const time = node('time', new Date(item.date).toLocaleString(state.language === 'ur' ? 'ur-PK' : 'en-GB')); time.dateTime = item.date; text.append(time);
    const button = node('button', t('delete'), 'button secondary'); button.addEventListener('click', () => { writeStorage('nova-saved', savedItems().filter(x => x.id !== item.id)); renderSaved(); }); card.append(text, button); list.append(card);
  }
}
function applyLanguage() {
  document.documentElement.lang = state.language; document.documentElement.dir = state.language === 'ur' ? 'rtl' : 'ltr'; $('#language').value = state.language;
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-placeholder]')) element.placeholder = t(element.dataset.placeholder);
  renderExamples(); renderMedia(); renderSaved(); renderResult(); refreshStatus();
}
async function refreshStatus() {
  try { const response = await fetch('/api/status'); if (!response.ok) throw new Error(); const status = await response.json(); $('#ai-status').textContent = t(status.configured ? 'ready' : 'missingKey'); $('#ai-status').className = `setup-note${status.configured ? ' ready' : ''}`; }
  catch { $('#ai-status').textContent = t('offline'); }
}
async function loadDraft() {
  const id = new URLSearchParams(location.search).get('draft'); if (!id) return;
  history.replaceState(null, '', '/'); setBusy(true);
  try {
    const response = await fetch(`/api/drafts/${encodeURIComponent(id)}`); const draft = await response.json(); if (!response.ok) throw new Error(draft.error);
    $('#content').value = draft.text; state.links = draft.links; state.sourceNotes = draft.notes; state.hasMedia = draft.hasMedia; updateCount();
    if (draft.files.length) {
      const file = draft.files[0], [prefix, base64] = file.dataUrl.split(','); const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      await attachFile(new File([bytes], file.name, { type: prefix.slice(5).split(';')[0] }));
    }
    if (draft.notes.length) message(draft.notes.join(' '));
  } catch (error) { message(error.message); }
  finally { setBusy(false); }
}

for (const tab of document.querySelectorAll('[data-kind]')) {
  tab.addEventListener('click', () => { if (state.busy) return; if (state.kind !== tab.dataset.kind) { state.media = null; $('#file').value = ''; setKind(tab.dataset.kind); renderMedia(); invalidate(); } });
  tab.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const tabs = [...document.querySelectorAll('[data-kind]')]; let index = tabs.indexOf(tab); index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[index].click(); tabs[index].focus(); });
}
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => {
  for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== `${button.dataset.view}-view`;
  for (const nav of document.querySelectorAll('[data-view]')) { nav.classList.toggle('active', nav === button); if (nav === button) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current'); }
  $('#breadcrumb-label').textContent = t(button.dataset.view === 'studio' ? 'studio' : button.dataset.view); stopSpeech();
});
$('#content').addEventListener('input', () => { updateCount(); invalidate(); });
$('#clear').addEventListener('click', clearContent);
$('#local-check').addEventListener('click', () => runCheck(false)); $('#ai-check').addEventListener('click', () => runCheck(true));
$('#file').addEventListener('change', () => { if ($('#file').files[0]) attachFile($('#file').files[0]); });
$('#dropzone').addEventListener('dragover', event => { event.preventDefault(); if (!state.busy) $('#dropzone').classList.add('dragging'); });
$('#dropzone').addEventListener('dragleave', () => $('#dropzone').classList.remove('dragging'));
$('#dropzone').addEventListener('drop', event => { event.preventDefault(); $('#dropzone').classList.remove('dragging'); if (!state.busy && event.dataTransfer.files[0]) attachFile(event.dataTransfer.files[0]); });
$('#language').addEventListener('change', () => { state.language = $('#language').value; writeStorage('nova-language', state.language); invalidate(); applyLanguage(); });
window.addEventListener('pagehide', stopSpeech);
applyLanguage(); loadDraft();
