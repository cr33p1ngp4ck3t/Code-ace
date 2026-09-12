const MAX_FILE = 40 * 1024 * 1024;
const MAX_SECONDS = 60;
export function fileDataUrl(blob) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('This file could not be read.')); reader.readAsDataURL(blob); });
}
function eventOnce(element, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); element.removeEventListener(event, ready); element.removeEventListener('error', failed); };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('This media format could not be opened. Try a JPEG image, MP3/WAV audio, or MP4/WebM video.')); };
    const timer = setTimeout(failed, timeout);
    element.addEventListener(event, ready, { once: true }); element.addEventListener('error', failed, { once: true });
  });
}
function kindOf(file) {
  if (/^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)) return 'image';
  if (file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name)) return 'video';
  if (file.type.startsWith('audio/') || /\.(wav|mp3|m4a|ogg|flac|mpeg)$/i.test(file.name)) return 'audio';
  throw new Error('Choose a JPG, PNG, WebP image, audio file, or MP4/WebM video.');
}
function snapshot(source, width, height) {
  if (!width || !height) throw new Error('This image or frame could not be read.');
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.78);
}
export function encodeWav(samples) {
  const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
  const text = (offset, word) => [...word].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const sample = Math.max(-1, Math.min(1, samples[i])); view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true); }
  return new Blob([bytes], { type: 'audio/wav' });
}
async function prepareAudio(file) {
  const context = new AudioContext();
  let decoded;
  try { decoded = await context.decodeAudioData(await file.arrayBuffer()); } finally { await context.close(); }
  const seconds = Math.min(MAX_SECONDS, decoded.duration);
  if (!Number.isFinite(seconds) || seconds < 0.05) throw new Error('This clip is too short to check.');
  const offline = new OfflineAudioContext(1, Math.floor(seconds * 16000), 16000);
  const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start(0);
  const rendered = await offline.startRendering();
  return { dataUrl: await fileDataUrl(encodeWav(rendered.getChannelData(0))), seconds: rendered.length / 16000, name: `${file.name.replace(/\.[^.]+$/, '')}.wav` };
}
export async function prepareFile(file) {
  if (!file || file.size === 0) throw new Error('This file is empty. Choose another file.');
  if (file.size > MAX_FILE) throw new Error('Choose a file smaller than 40 MB.');
  const kind = kindOf(file), result = { kind, images: [], audio: null, notes: [], hasMedia: true, name: file.name };
  if (kind === 'image') {
    let bitmap;
    try { bitmap = await createImageBitmap(file); result.images = [{ dataUrl: snapshot(bitmap, bitmap.width, bitmap.height), name: file.name, seconds: null }]; }
    catch { throw new Error('This image could not be opened. Try a JPG, PNG, or WebP file.'); }
    finally { bitmap?.close(); }
    return result;
  }
  const element = document.createElement(kind), objectUrl = URL.createObjectURL(file);
  element.preload = 'auto'; element.muted = true;
  try {
    const ready = eventOnce(element, 'loadedmetadata'); element.src = objectUrl; await ready;
    if (element.duration === Infinity) {
      const durationReady = eventOnce(element, 'durationchange'); element.currentTime = 1e7; await durationReady;
    }
    if (!Number.isFinite(element.duration) || element.duration <= 0) throw new Error('The clip duration could not be read. Try exporting it as MP4, MP3, or WAV.');
    if (element.duration > 120) throw new Error('For this demo, trim clips to two minutes or less. Verifeed checks up to the first 60 seconds.');
    if (element.duration > MAX_SECONDS) result.notes.push('Only the first 60 seconds were included.');
    if (kind === 'video') {
      const end = Math.min(element.duration, MAX_SECONDS);
      for (const time of [end * 0.2, end * 0.75]) {
        const seeked = eventOnce(element, 'seeked'); element.currentTime = Math.min(time, element.duration - 0.02); await seeked;
        result.images.push({ dataUrl: snapshot(element, element.videoWidth, element.videoHeight), name: file.name, seconds: Number(element.currentTime.toFixed(2)) });
      }
      result.notes.push('Two sampled frames were checked; events between frames may be missed.');
    }
    try { result.audio = await prepareAudio(file); }
    catch (error) { if (kind === 'audio') throw new Error('This audio could not be decoded. Try a WAV or MP3 file.'); result.notes.push('The video audio could not be extracted. Only sampled frames will be checked.'); }
    return result;
  } finally { element.removeAttribute('src'); element.load(); URL.revokeObjectURL(objectUrl); }
}

export async function samplePoster() {
  const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700;
  const context = canvas.getContext('2d');
  context.fillStyle = '#153e34'; context.fillRect(0, 0, 1000, 700);
  context.fillStyle = '#d7efaa'; context.font = 'bold 25px sans-serif'; context.fillText('FICTIONAL DEMO · PRACTICE EXAMPLE', 70, 85);
  context.fillStyle = '#fff'; context.font = 'bold 64px sans-serif'; context.fillText('Your next internship.', 70, 220);
  context.fillText('Guaranteed.', 70, 295);
  context.font = '30px sans-serif'; context.fillText('No interview. Work from home.', 70, 395);
  context.fillStyle = '#f9bd88'; context.fillText('Pay a registration fee of PKR 2,500 to apply.', 70, 485);
  context.font = 'bold 30px sans-serif'; context.fillText('Send payment today to reserve your place.', 70, 545);
  context.fillStyle = '#b8cec5'; context.font = '22px sans-serif'; context.fillText('Training sample. No real offer or payment destination.', 70, 645);
  return new File([await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))], 'practice-internship.png', { type: 'image/png' });
}
