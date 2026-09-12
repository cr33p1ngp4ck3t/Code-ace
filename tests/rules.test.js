import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/shared/rules.js';
const { scan } = globalThis.NovaRules;

test('normal posts and harmless AI disclosure are not treated as scams', () => {
  assert.equal(scan({ text: 'A quiet afternoon at the park with my family.' }).risk, 'low');
  assert.equal(scan({ text: 'An AI-generated illustration I made for fun. I love these colors.' }).risk, 'low');
  assert.equal(scan({ text: 'JOB UPDATE! 😍 Hiring engineers, apply on our careers page.' }).risk, 'low');
});
test('combines job context and advance fees across sentences', () => {
  const result = scan({ text: 'Guaranteed remote internship. Pay a registration fee to reserve a place.' });
  assert.equal(result.risk, 'high'); assert.equal(result.reasons[0].id, 'job-fee');
});
test('private codes, fee-based prizes and guaranteed returns trigger concrete warnings', () => {
  assert.equal(scan({ text: 'Send your OTP to verify your account.' }).risk, 'high');
  assert.equal(scan({ text: 'You won the prize! Pay a processing fee to claim it.' }).risk, 'high');
  assert.equal(scan({ text: 'Invest today. Double your money with guaranteed profit.' }).risk, 'high');
  assert.equal(scan({ text: 'Do not delay, send your OTP to verify your account.' }).risk, 'high');
});
test('educational warnings and negated fee requests are not mistaken for solicitations', () => {
  assert.equal(scan({ text: 'Never share your OTP. Do not pay a registration fee for a job without independently checking the employer.' }).risk, 'low');
  assert.equal(scan({ text: 'Our internship has no registration fee. Apply on our official website.' }).risk, 'low');
});
test('Urdu requests have Urdu explanations', () => {
  const result = scan({ text: 'نوکری کے لیے رجسٹریشن فیس پہلے دیں۔', language: 'ur' });
  assert.equal(result.risk, 'high'); assert.match(result.headline, /دھوکے/);
});
test('uninspected media and empty content do not receive a green verdict', () => {
  assert.equal(scan({}).risk, 'unknown');
  assert.equal(scan({ text: 'Details are in this attachment.', hasMedia: true }).risk, 'unknown');
  assert.equal(scan({ text: 'Send me your password.', hasMedia: true }).risk, 'high');
  assert.equal(scan({ text: 'Details are in this attachment.', hasMedia: true }).authenticity, 'unverified');
});
test('links are evidence signals rather than visited or reputation checked', () => {
  assert.equal(scan({ text: 'Your account is blocked. Click immediately.', links: ['https://example.invalid/login'] }).risk, 'caution');
  assert.equal(scan({ text: 'See the library opening hours.', links: ['https://example.org/hours'] }).risk, 'low');
  assert.equal(scan({ text: 'See this address for details.', links: ['https://brand.example@192.0.2.1/login'] }).risk, 'caution');
  assert.equal(scan({ text: 'Our normal community update.', links: ['javascript:alert(1)', 'not a url'] }).risk, 'low');
});
