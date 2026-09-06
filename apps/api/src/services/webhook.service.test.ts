import { describe, expect, it } from 'vitest';
import { buildPayload, signPayload, webhookUrlError } from './webhook.service.js';

describe('webhook signatures', () => {
  it('signs the raw body with HMAC-SHA256 and is deterministic', () => {
    const sig = signPayload('s3cret', '{"a":1}');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signPayload('s3cret', '{"a":1}')).toBe(sig);
    expect(signPayload('other', '{"a":1}')).not.toBe(sig);
  });
  it('payloads carry an id, the event, a timestamp, the mosque and the data', () => {
    const { id, body } = buildPayload('t1', 'khutbah.created', { khutbahId: 'k1' });
    const parsed = JSON.parse(body);
    expect(parsed).toMatchObject({ id, event: 'khutbah.created', tenantId: 't1', data: { khutbahId: 'k1' } });
    expect(new Date(parsed.createdAt).getTime()).toBeGreaterThan(0);
  });
});

describe('webhookUrlError', () => {
  it('accepts public https endpoints', () => {
    expect(webhookUrlError('https://hooks.example.org/jumaah', true)).toBeNull();
    expect(webhookUrlError('https://alnoor.org.sa:8443/x?y=1', true)).toBeNull();
  });
  it('requires https in production, tolerates http elsewhere', () => {
    expect(webhookUrlError('http://hooks.example.org/x', true)).toBe('HTTPS_REQUIRED');
    expect(webhookUrlError('http://hooks.example.org/x', false)).toBeNull();
  });
  it('never calls loopback, private or link-local hosts, and rejects credentials and junk', () => {
    for (const u of ['https://localhost/x', 'https://127.0.0.1/x', 'https://10.1.2.3/x', 'https://192.168.1.9/x', 'https://172.20.0.1/x', 'https://169.254.1.1/x', 'https://[::1]/x', 'https://api.internal/x', 'https://box.local/x']) {
      expect(webhookUrlError(u, false)).toBe('PRIVATE_HOST');
    }
    expect(webhookUrlError('https://user:pw@hooks.example.org/x', true)).toBe('CREDENTIALS_IN_URL');
    expect(webhookUrlError('not a url', true)).toBe('INVALID_URL');
  });
});

describe('DNS rebinding guard', () => {
  it('classifies private, loopback, link-local and mapped addresses', async () => {
    const { isPrivateIp, resolvesToPrivate } = await import('./webhook.service.js');
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '172.31.255.255', '169.254.1.1', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1']) expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111', '203.0.113.10']) expect(isPrivateIp(ip), ip).toBe(false);
    expect(await resolvesToPrivate('https://hooks.example.org/x', async () => [{ address: '203.0.113.10' }])).toBe(false);
    expect(await resolvesToPrivate('https://hooks.example.org/x', async () => [{ address: '203.0.113.10' }, { address: '10.1.1.1' }])).toBe(true);
    expect(await resolvesToPrivate('https://hooks.example.org/x', async () => [])).toBe(true);
    expect(await resolvesToPrivate('https://hooks.example.org/x', async () => { throw new Error('ENOTFOUND'); })).toBe(true);
  });
});
