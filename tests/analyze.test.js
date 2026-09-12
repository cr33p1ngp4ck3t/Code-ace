import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzer, validateInput } from '../server/analyze.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk1cAAAAASUVORK5CYII=';
function wav(seconds = 1) {
  const bytes = Buffer.alloc(44 + seconds * 32000); bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8); bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40); return `data:audio/wav;base64,${bytes.toString('base64')}`;
}
const assessment = { risk: 'caution', reasons: [{ title: 'A suspicious request', detail: 'The supplied content asks for a private code.', evidence: 'send your OTP' }], action: 'Contact the organization through its official app.' };
const completion = (value, extra = {}) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }], usage: { total_tokens: 100 }, ...extra }), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('rejects malformed, oversized, remote media and unsupported payloads before API calls', () => {
  for (const input of [{}, { text: 'a'.repeat(6001) }, { text: 'hello', images: [{ dataUrl: 'http://127.0.0.1/private' }] }, { images: Array(3).fill({ dataUrl: png }) }, { images: [{ dataUrl: 'data:image/jpeg;base64,YWJjZA==' }] }, { audio: { dataUrl: 'data:audio/wav;base64,YWJjZA==' } }]) assert.throws(() => validateInput(input), error => error.status === 400);
});
test('derives audio duration from validated WAV bytes rather than client claims', () => {
  const input = validateInput({ kind: 'audio', audio: { dataUrl: wav(2), seconds: 0.1 } }); assert.equal(input.audio.seconds, 2);
  assert.throws(() => validateInput({ audio: { dataUrl: wav(61) } }), error => error.status === 400);
});
test('missing API key returns an explicit setup error and makes no network calls', async () => {
  const analyzer = createAnalyzer({}, () => { assert.fail('No network call should be made'); });
  await assert.rejects(analyzer.analyze({ text: 'A normal message for my friends.' }), error => error.code === 'AI_NOT_CONFIGURED');
});

test('blank keys are unconfigured and cannot trigger a provider request', async t => {
  const analyzer = createAnalyzer({ apiKey: '  \t ' }, () => assert.fail('No network call should be made'));
  t.after(() => analyzer.close());
  assert.equal(analyzer.status().configured, false);
  await assert.rejects(analyzer.analyze({ text: 'A normal message for my friends.' }), error => error.code === 'AI_NOT_CONFIGURED');
});

test('rejected keys and denied permissions have distinct actionable errors without leaking provider responses', async t => {
  for (const [status, code, message] of [[401, 'PROVIDER_AUTH', /Replace GROQ_API_KEY/], [403, 'PROVIDER_PERMISSION', /organization and project model permissions/]]) {
    const analyzer = createAnalyzer({ apiKey: 'test-only-placeholder' }, async () => new Response(JSON.stringify({ error: { message: 'private provider detail' } }), { status }));
    t.after(() => analyzer.close());
    await assert.rejects(analyzer.analyze({ text: 'A normal message for my friends.' }), error => error.code === code && message.test(error.message) && !error.message.includes('private provider detail'));
  }
});
test('reuses identical completed requests and merges in-flight duplicates', async () => {
  let calls = 0;
  const analyzer = createAnalyzer({ apiKey: 'test-only-placeholder' }, async () => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); return completion(assessment); });
  const input = { text: 'Please look at this message for me.' };
  const [a, b] = await Promise.all([analyzer.analyze(input), analyzer.analyze(input)]); assert.deepEqual(a, b); assert.equal(calls, 1);
  assert.equal((await analyzer.analyze(input)).cached, true); assert.equal(calls, 1);
});
test('image and audio observations feed GPT-OSS; application keeps media origin unverified', async () => {
  const calls = [];
  const analyzer = createAnalyzer({ apiKey: 'test-only-placeholder' }, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('audio/transcriptions')) return new Response(JSON.stringify({ text: 'Send your OTP to verify your account.' }));
    const body = JSON.parse(options.body);
    if (body.model.startsWith('qwen/')) return completion({ visible_text: 'Send your OTP', observations: ['A poster asks for a private code.'], limitations: 'Only visible content was observed.' });
    return completion({ ...assessment, authenticity: 'definitely-real', risk: 'low' });
  });
  const result = await analyzer.analyze({ kind: 'video', images: [{ dataUrl: png, seconds: 1 }, { dataUrl: png, seconds: 3 }], audio: { dataUrl: wav(2) } });
  assert.equal(calls.length, 3); assert.equal(result.coverage.videoFrames, 2); assert.equal(result.coverage.audioSeconds, 2); assert.equal(result.coverage.images, 0);
  assert.equal(result.authenticity, 'unverified'); assert.equal(result.risk, 'high');
  const final = JSON.parse(calls.at(-1).options.body); assert.equal(final.model, 'openai/gpt-oss-120b'); assert.match(final.messages[1].content, /Send your OTP/); assert.equal(final.tools, undefined);
  assert.ok(calls[1].options.body instanceof FormData); assert.equal(calls[1].options.body.get('file').type, 'audio/wav');
});
test('uninspected attachments cannot become green through a caption-only AI response', async () => {
  const analyzer = createAnalyzer({ apiKey: 'test-only-placeholder' }, async () => completion({ ...assessment, risk: 'low', reasons: [] }));
  const result = await analyzer.analyze({ text: 'The details are in the video.', hasMedia: true }); assert.equal(result.risk, 'unknown'); assert.equal(result.coverage.mediaUnchecked, true);
});
test('upstream rate limiting is respected without a retry loop', async () => {
  let calls = 0;
  const analyzer = createAnalyzer({ apiKey: 'test-only-placeholder' }, async () => { calls++; return new Response('{}', { status: 429, headers: { 'retry-after': '20' } }); });
  await assert.rejects(analyzer.analyze({ text: 'Check this suspicious message.' }), error => error.status === 429 && error.retryAfter === 20);
  await assert.rejects(analyzer.analyze({ text: 'Check a different message.' }), error => error.status === 429);
  assert.equal(calls, 1);
});
test('invalid and truncated model results are errors, not fabricated successful checks', async () => {
  for (const response of [completion({ risk: 'safe' }), completion(assessment, { choices: [{ finish_reason: 'length', message: { content: '{}' } }] })]) {
    const analyzer = createAnalyzer({ apiKey: 'test-only-placeholder' }, async () => response);
    await assert.rejects(analyzer.analyze({ text: 'Please check this message.' }), error => error.code === 'INVALID_AI_RESPONSE');
  }
});
test('enforces request and token budgets without spending on cache hits', async () => {
  const analyzer = createAnalyzer({ apiKey: 'test-only-placeholder', maxDaily: 1 }, async () => completion(assessment));
  await analyzer.analyze({ text: 'First message for checking.' });
  assert.equal((await analyzer.analyze({ text: 'First message for checking.' })).cached, true);
  await assert.rejects(analyzer.analyze({ text: 'A second different message.' }), error => error.code === 'DAILY_LIMIT');
  const tiny = createAnalyzer({ apiKey: 'test-only-placeholder', maxTokens: 100 }, () => assert.fail('Over-budget request reached provider'));
  await assert.rejects(tiny.analyze({ text: 'A message for checking.' }), error => error.code === 'DAILY_LIMIT');
});
