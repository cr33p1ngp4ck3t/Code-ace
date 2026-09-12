import { getBackend } from './backend.js';
import { installWebsiteNavigation } from './website-navigation.js';
installWebsiteNavigation();
chrome.permissions.onAdded.addListener(installWebsiteNavigation);
chrome.permissions.onRemoved.addListener(async () => {
  const allowed = await chrome.permissions.contains({ permissions: ['webNavigation'], origins: ['http://*/*', 'https://*/*'] });
  if (!allowed) await chrome.storage.local.set({ websiteGuard: false });
});
const FEED_HOSTS = new Set(['x.com', 'twitter.com', 'www.facebook.com', 'facebook.com', 'www.instagram.com', 'instagram.com', 'www.linkedin.com', 'linkedin.com', '127.0.0.1', 'localhost']);
function supportedPage(raw) { try { const url = new URL(raw); return FEED_HOSTS.has(url.hostname) && (url.protocol === 'https:' || (['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol === 'http:' && url.pathname.startsWith('/demo'))); } catch { return false; } }
function allowedMedia(raw, backend) {
  try {
    const url = new URL(raw); if (url.username || url.password) return false;
    if (url.origin === backend.url && url.pathname.startsWith('/assets/')) return true;
    if (url.protocol === 'http:') return ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '4317' && url.pathname.startsWith('/assets/');
    if (url.protocol !== 'https:') return false;
    return ['pbs.twimg.com', 'video.twimg.com', 'media.licdn.com', 'dms.licdn.com'].includes(url.hostname) || ['fbcdn.net', 'cdninstagram.com'].some(domain => url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}
async function fetchAttachment(media, backend) {
  if (!allowedMedia(media?.src, backend)) throw new Error('This platform did not expose an accessible media file. Upload the original file to include it.');
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
const panelDrafts = new Map();
function panelDraft(post, tabId, language) {
  for (const [id, draft] of panelDrafts) if (draft.expires < Date.now()) panelDrafts.delete(id);
  if (panelDrafts.size >= 20) panelDrafts.delete(panelDrafts.keys().next().value);
  const id = crypto.randomUUID();
  const data = { text: typeof post?.text === 'string' ? post.text.slice(0, 6000) : '', links: Array.isArray(post?.links) ? post.links.filter(x => typeof x === 'string' && x.length < 2000).slice(0, 8) : [], media: Array.isArray(post?.media) ? post.media.slice(0, 4).map(item => ({ kind: String(item?.kind || '').slice(0, 10), src: String(item?.src || '').slice(0, 4000) })) : [], hasMedia: Boolean(post?.hasMedia), permalink: String(post?.permalink || '').slice(0, 2000), platform: String(post?.platform || 'Selected content').slice(0, 60) };
  data.context = post?.context === 'website' ? 'website' : 'post';
  panelDrafts.set(id, { post: data, tabId, language: language === 'ur' ? 'ur' : 'en', expires: Date.now() + 60000 });
  return id;
}
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'nova-selection', title: 'Review selected text with Verifeed', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'nova-image', title: 'Review this image with Verifeed', contexts: ['image'] });
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
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: chrome.runtime.getManifest().content_scripts[0].js });
    await chrome.tabs.sendMessage(tab.id, { type: 'VERIFEED_CONTEXT_REVIEW', post: { text: info.selectionText || '', links: [], hasMedia: info.menuItemId === 'nova-image', media: info.menuItemId === 'nova-image' ? [{ kind: 'image', src: info.srcUrl }] : [] } }, { frameId: 0 });
  }
  catch (error) { await chrome.storage.session.set({ lastError: error.message }); await chrome.action.setBadgeText({ text: '!' }); await chrome.action.setBadgeBackgroundColor({ color: '#ad6845' }); }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.tab) return;
  if (message?.type === 'VERIFEED_PANEL_START' && sender.frameId === 0) {
    sendResponse({ ok: true, id: panelDraft(message.post, sender.tab.id, message.language) }); return;
  }
  if (message?.type !== 'VERIFEED_PANEL_CLAIM' || sender.frameId === 0 || sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('review.html')) return;
  const draft = panelDrafts.get(message.id);
  if (!draft || draft.tabId !== sender.tab.id || draft.expires < Date.now()) { sendResponse({ ok: false, error: 'This review expired. Close it with × and open the post again.' }); return; }
  panelDrafts.delete(message.id);
  (async () => {
    const notes = []; let file = null;
    if (draft.post.media.length) {
      try { file = await fetchAttachment(draft.post.media[0], await getBackend()); } catch (error) { notes.push(error.message); }
      if (draft.post.media.length > 1) notes.push('Only the first attachment was included. Other attachments have not been checked.');
    }
    return { ok: true, post: draft.post, language: draft.language, file, notes };
  })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
