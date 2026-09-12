import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/shared/writing.js';
import '../extension/shared/rules.js';
import { createAnalyzer } from '../server/analyze.js';
const writing = globalThis.VerifeedWriting;
const formulaic = "In today's fast-paced world, we unlock your potential and revolutionize the way you work. This game-changer will help you delve into new opportunities. Our solution offers meaningful progress for every team and every challenge, with a future full of possibilities.";
test('formulaic writing gets a separate, evidence-based observation without becoming a scam', () => {
  const result = writing.scan(formulaic); assert.equal(result.status, 'signals'); assert.equal(result.authorship, 'unverified');
  assert.ok(result.signals.every(signal => formulaic.includes(signal.evidence))); assert.equal(globalThis.NovaRules.scan({ text: formulaic }).risk, 'low');
});
test('short, fluent, Urdu and educational posts do not imply human or AI authorship', () => {
  assert.equal(writing.scan('A nice day at the park — loved it! 🌿').status, 'insufficient');
  const normal = 'We met at the library on Saturday to compare the three designs. The second design used fewer pieces and fit on the smaller table. We will try it with six participants next week and write down how long each person takes to finish.';
  assert.equal(writing.scan(normal).status, 'unclear');
  assert.equal(writing.scan('آج پارک میں دوستوں سے ملاقات ہوئی۔ موسم بہت خوشگوار تھا۔', 'ur').status, 'insufficient');
  assert.notEqual(writing.scan('AI detectors may misread phrases like "as an AI language model". Never assume this phrase proves authorship.').status, 'signals');
});
test('explicit text disclosures are distinguished from AI pictures and uncertain style', () => {
  assert.equal(writing.scan('I used ChatGPT to write this post about my workshop.').status, 'disclosed');
  assert.notEqual(writing.scan('I made an AI-generated illustration of my dream room.').status, 'disclosed');
  assert.equal(writing.scan('Certainly! Here is a polished version of your post.').status, 'signals');
});
test('unsupported quotes and invented authorship claims are discarded', () => {
  const result = writing.normalize({ status: 'definitely-ai', authorship: 'ai', probability: 99, signals: [{ code: 'repetition', evidence: 'This quotation never appeared in the post.' }, { code: 'fake-code', evidence: formulaic.slice(0, 35) }] }, formulaic);
  assert.equal(result.authorship, 'unverified'); assert.equal(result.probability, undefined); assert.ok(result.signals.every(signal => formulaic.includes(signal.evidence)));
});
test('Groq adds writing observations in the existing check; media text cannot supply caption evidence', async () => {
  let calls = 0;
  const analyzer = createAnalyzer({ apiKey: 'test-only-placeholder' }, async () => {
    calls++;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ risk: 'low', reasons: [], action: 'Check the original source.', writing: { authorship: 'confirmed-ai', signals: [{ code: 'template_language', evidence: "In today's fast-paced world" }, { code: 'generic_claims', evidence: 'a future full of possibilities' }] } }) } }] }));
  });
  try {
    const result = await analyzer.analyze({ text: formulaic }); assert.equal(calls, 1); assert.equal(result.risk, 'low'); assert.equal(result.writing.status, 'signals'); assert.equal(result.writing.authorship, 'unverified');
    assert.equal(writing.normalize({ signals: result.writing.signals }, '').status, 'insufficient');
  } finally { analyzer.close(); }
});
