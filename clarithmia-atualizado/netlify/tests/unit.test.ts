import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyze } from '../lib/ai.ts';
import { cleanText, normalizeRating, normalizeWebhookItem, toIso } from '../lib/normalize.ts';
import { redact } from '../lib/logger.ts';
import { retryAfterMs } from '../lib/http-client.ts';
import { constantTimeEqual, hmacSha256Hex, verifySignature } from '../lib/auth.ts';
import type { NormalizedFeedback } from '../lib/types.ts';

function feedback(text: string, extra: Partial<NormalizedFeedback> = {}): NormalizedFeedback {
  return {
    id: 'test:1', dedupeKey: 'x', source: 'test', channel: 'test', externalId: '1', author: { name: 'T' },
    text, createdAt: '2026-10-01T10:00:00.000Z', receivedAt: '2026-10-01T10:00:00.000Z', metadata: {}, ...extra,
  };
}

describe('ai.analyze', () => {
  it('flags a slow checkout that loses revenue as negative / performance / high urgency', () => {
    const a = analyze(feedback('Checkout page takes forever to load on mobile. Lost 3 customers today because they abandoned their carts. This needs urgent attention.'));
    assert.equal(a.sentiment.label, 'negative');
    assert.equal(a.category, 'Performance');
    assert.ok(a.urgency.score >= 65, `score ${a.urgency.score}`);
    assert.equal(a.urgency.inboxLevel, 'high');
  });

  it('detects billing problems and unanswered tickets', () => {
    const a = analyze(feedback('Been charged twice for my Pro subscription this month. Submitted a ticket 5 days ago and still no response. Getting really frustrated.'));
    assert.equal(a.sentiment.label, 'negative');
    assert.equal(a.category, 'Billing');
    assert.ok(['high', 'critical'].includes(a.urgency.level));
  });

  it('keeps praise low urgency and positive', () => {
    const a = analyze(feedback('Absolutely love the new dark mode design! Beautiful and intuitive.'));
    assert.equal(a.sentiment.label, 'positive');
    assert.equal(a.category, 'UI/UX');
    assert.ok(a.urgency.score <= 25);
    assert.equal(a.urgency.level, 'low');
  });

  it('understands Portuguese', () => {
    const a = analyze(feedback('O app está travando toda hora, péssimo! Preciso de ajuda urgente.'));
    assert.equal(a.sentiment.label, 'negative');
    assert.equal(a.category, 'Stability');
    assert.ok(a.urgency.score >= 50);
  });

  it('honours negation and ratings', () => {
    assert.notEqual(analyze(feedback('This is not good at all')).sentiment.label, 'positive');
    const withRating = analyze(feedback('Ok.', { rating: 1 }));
    assert.equal(withRating.sentiment.label, 'negative');
  });

  it('stays within documented ranges', () => {
    const a = analyze(feedback('WHY IS THIS BROKEN!!! URGENT!!! CRASH CRASH'));
    assert.ok(a.urgency.score >= 0 && a.urgency.score <= 100);
    assert.ok(a.confidence >= 0.5 && a.confidence <= 0.97);
    assert.ok(a.sentiment.score >= -1 && a.sentiment.score <= 1);
  });
});

describe('normalize helpers', () => {
  it('cleans html and control characters', () => {
    assert.equal(cleanText('<p>Hello&nbsp;<b>world</b></p>\u0000  !'), 'Hello world !');
  });
  it('parses dates in several formats', () => {
    assert.equal(toIso('2026-10-01T10:00:00Z'), '2026-10-01T10:00:00.000Z');
    assert.equal(toIso(1790848800), '2026-10-01T10:00:00.000Z');
    assert.equal(toIso('1790848800000'), '2026-10-01T10:00:00.000Z');
    assert.equal(toIso('nope'), null);
  });
  it('scales ratings to 1..5', () => {
    assert.equal(normalizeRating(4), 4);
    assert.equal(normalizeRating(8), 4);
    assert.equal(normalizeRating(80), 4);
    assert.equal(normalizeRating(-1), undefined);
    assert.equal(normalizeRating('abc'), undefined);
  });
  it('maps free-form webhook payloads and generates stable ids', async () => {
    const ctx = { defaultSource: 'webhook', receivedAt: '2026-10-01T10:00:00.000Z' };
    const a = await normalizeWebhookItem({ message: 'Great app', user: { name: 'Ana', email: 'ANA@corp.com' }, stars: 9, platform: 'App Store' }, ctx);
    const b = await normalizeWebhookItem({ message: 'Great app', user: { name: 'Ana' }, stars: 9, platform: 'App Store' }, ctx);
    assert.ok(a.ok && b.ok);
    if (a.ok && b.ok) {
      assert.equal(a.feedback.source, 'app-store');
      assert.equal(a.feedback.author.email, 'ana@corp.com');
      assert.equal(a.feedback.rating, 4.5);
      assert.equal(a.feedback.dedupeKey, b.feedback.dedupeKey);
    }
    assert.deepEqual(await normalizeWebhookItem({ nothing: true }, ctx), { ok: false, reason: 'missing_text' });
    assert.deepEqual(await normalizeWebhookItem('x', ctx), { ok: false, reason: 'item_must_be_object' });
  });
});

describe('infrastructure helpers', () => {
  it('redacts secrets in logs, recursively', () => {
    const out = redact({ authorization: 'Bearer abc', nested: { apiKey: 'k', paginationToken: 'cursor-1', ok: 'visible' } }) as Record<string, any>;
    assert.equal(out.authorization, '[REDACTED]');
    assert.equal(out.nested.apiKey, '[REDACTED]');
    assert.equal(out.nested.paginationToken, 'cursor-1');
    assert.equal(out.nested.ok, 'visible');
  });
  it('reads Retry-After and x-rate-limit-reset', () => {
    assert.equal(retryAfterMs(new Headers({ 'retry-after': '3' })), 3000);
    const reset = Math.floor(Date.now() / 1000) + 10;
    const ms = retryAfterMs(new Headers({ 'x-rate-limit-reset': String(reset) })) ?? 0;
    assert.ok(ms > 8000 && ms <= 10000);
    assert.equal(retryAfterMs(new Headers()), null);
  });
  it('compares secrets in constant time and verifies HMAC signatures', async () => {
    assert.equal(await constantTimeEqual('abc', 'abc'), true);
    assert.equal(await constantTimeEqual('abc', 'abd'), false);
    assert.equal(await constantTimeEqual('abc', 'abcd'), false);
    const signature = await hmacSha256Hex('s3cret', '{"a":1}');
    assert.equal(await verifySignature('{"a":1}', `sha256=${signature}`, 's3cret'), true);
    assert.equal(await verifySignature('{"a":2}', `sha256=${signature}`, 's3cret'), false);
    assert.equal(await verifySignature('{"a":1}', null, 's3cret'), false);
  });
});
