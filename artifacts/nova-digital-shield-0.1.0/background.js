const BACKEND = 'http://127.0.0.1:4317';
const FEED_HOSTS = new Set(['x.com', 'twitter.com', 'www.facebook.com', 'facebook.com', 'www.instagram.com', 'instagram.com', 'www.linkedin.com', 'linkedin.com', '127.0.0.1', 'localhost']);
function supportedPage(raw) { try { const url = new URL(raw); return FEED_HOSTS.has(url.hostname) && (url.protocol === 'https:' || (['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol === 'http:' && url.port === '4317')); } catch { return false; } }
function allowedMedia(raw) {
  try {
    const url = new URL(raw); if (url.username || url.password) return false;
    if (url.protocol === 'http:') return ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '4317' && url.pathname.startsWith('/assets/');
    if (url.protocol !== 'https:') return false;
    return ['pbs.twimg.com', 'video.twimg.com', 'media.licdn.com', 'dms.licdn.com'].includes(url.hostname) || ['fbcdn.net', 'cdninstagram.com'].some(domain => url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}
async function fetchAttachment(media) {
  if (!allowedMedia(media?.src)) throw new Error('This platform did not expose an accessible media file. Upload the original file to include it.');
  const response = await fetch(media.src, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('The post’s media could not be retrieved. Upload the file to include it.');
  if (Number(response.headers.get('content-length')) > 9000000) throw new Error('This attachment is too large to import automatically. Upload a shorter clip or smaller image.');
  const reader = response.body.getReader(), parts = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 9000000) throw new Error('This attachment is too large to import. Upload a smaller file.'); parts.push(value); } }
  finally { await reader.cancel(); }
  let mime = (response.headers.get('content-type') || '').split(';')[0].trim();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  const formats = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'video/mp4': 'mp4', 'video/webm': 'webm' };
  if (!formats[mime]) throw new Error('This media format cannot be imported. Upload a JPG, PNG, audio clip, or MP4/WebM video.');
  const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { name: `post-${media.kind || 'media'}.${formats[mime]}`, dataUrl: `data:${mime};base64,${btoa(binary)}` };
}
let opening = false;
async function openReview(post) {
  if (opening) throw new Error('A review is already opening. Please wait.');
  opening = true;
  try {
    const draft = { text: typeof post?.text === 'string' ? post.text.slice(0, 6000) : '', links: Array.isArray(post?.links) ? post.links.filter(x => typeof x === 'string' && x.length < 2000).slice(0, 8) : [], hasMedia: Boolean(post?.hasMedia), files: [], notes: [] };
    const media = Array.isArray(post?.media) ? post.media.slice(0, 4) : [];
    if (media.length) {
      try { draft.files.push(await fetchAttachment(media[0])); } catch (error) { draft.notes.push(error.message); }
      if (media.length > 1) draft.notes.push('Only the first attachment was imported. Other post media has not been checked.');
    }
    let response;
    try { response = await fetch(`${BACKEND}/api/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft), signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error('Start the Nova backend with npm start, then open this check again.'); }
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'This review could not be opened.');
    await chrome.tabs.create({ url: `${BACKEND}/?draft=${encodeURIComponent(data.id)}` });
  } finally { opening = false; }
}
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'nova-selection', title: 'Review selected text with Nova', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'nova-image', title: 'Review this image with Nova', contexts: ['image'] });
  });
  // Tabs that were open before installation do not receive declarative scripts.
  const script = chrome.runtime.getManifest().content_scripts[0];
  const tabs = await chrome.tabs.query({ url: script.matches });
  await Promise.allSettled(tabs.filter(tab => supportedPage(tab.url)).map(tab =>
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: script.js })
  ));
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!['nova-selection', 'nova-image'].includes(info.menuItemId)) return;
  try { await openReview({ text: info.selectionText || '', links: [], hasMedia: info.menuItemId === 'nova-image', media: info.menuItemId === 'nova-image' ? [{ kind: 'image', src: info.srcUrl }] : [] }); }
  catch (error) { await chrome.storage.session.set({ lastError: error.message }); await chrome.action.setBadgeText({ text: '!' }); await chrome.action.setBadgeBackgroundColor({ color: '#ad6845' }); }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'NOVA_REVIEW' || sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 || !supportedPage(sender.tab.url)) return;
  openReview(message.post).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
