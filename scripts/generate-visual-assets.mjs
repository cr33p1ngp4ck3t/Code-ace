import { chromium } from 'playwright';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { makeServer } from '../server/index.js';

const server = makeServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const fallback = await access(edge).then(() => edge).catch(() => undefined);
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'], ...(fallback ? { executablePath: fallback } : {}) });
try {
  const page = await browser.newPage(); await page.goto(base);
  await mkdir('extension/icons', { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const data = await page.evaluate(async size => {
      const image = new Image(); image.src = '/assets/shield.svg'; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size; canvas.getContext('2d').drawImage(image, 0, 0, size, size); return canvas.toDataURL('image/png').split(',')[1];
    }, size);
    await writeFile(resolve(`extension/icons/${size}.png`), Buffer.from(data, 'base64'));
  }
  const poster = await page.evaluate(async () => { const { samplePoster, fileDataUrl } = await import('/lib/media.js'); return (await fileDataUrl(await samplePoster())).split(',')[1]; });
  await writeFile('web/assets/sample-poster.png', Buffer.from(poster, 'base64'));
  const video = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 500;
    const ctx = canvas.getContext('2d');
    const audio = new AudioContext(); await audio.resume();
    const source = audio.createBufferSource(); source.buffer = await audio.decodeAudioData(await (await fetch('/assets/video-speech.wav')).arrayBuffer());
    const destination = audio.createMediaStreamDestination(); source.connect(destination);
    const stream = canvas.captureStream(10); stream.addTrack(destination.stream.getAudioTracks()[0]);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 350000 });
    const chunks = [];
    const stopped = new Promise(resolve => { recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); }; recorder.onstop = resolve; });
    let frame = 0;
    const draw = () => {
      ctx.fillStyle = '#244c3c'; ctx.fillRect(0, 0, 800, 500); ctx.fillStyle = '#dce9bd'; ctx.font = 'bold 20px Arial'; ctx.fillText('FICTIONAL PRACTICE EXAMPLE', 48, 64);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 58px Arial'; ctx.fillText('You won a prize!', 48, 185);
      ctx.fillStyle = '#f3c594'; ctx.font = '28px Arial'; ctx.fillText('Pay a processing fee to claim your reward.', 48, 270);
      ctx.fillStyle = '#bacfac'; ctx.font = '20px Arial'; ctx.fillText('A sample message for learning to spot warning signs.', 48, 362);
      ctx.fillStyle = '#dce9bd'; ctx.fillRect(48, 425, Math.min(700, frame * 8), 5); frame++;
    };
    draw(); const interval = setInterval(draw, 100); recorder.start(); source.start();
    await new Promise(resolve => { source.onended = resolve; }); await new Promise(resolve => setTimeout(resolve, 300)); recorder.stop(); await stopped;
    clearInterval(interval); stream.getTracks().forEach(track => track.stop()); await audio.close();
    const { fileDataUrl } = await import('/lib/media.js'); return (await fileDataUrl(new Blob(chunks, { type: 'video/webm' }))).split(',')[1];
  });
  await writeFile('web/assets/sample-video.webm', Buffer.from(video, 'base64'));
  console.log('Generated extension icons, a practice poster, and a narrated practice video.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
