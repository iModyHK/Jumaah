import { describe, expect, it } from 'vitest';
import { moyasarCreateInvoice, moyasarInvoiceState, paymentProviderName } from './payment.service.js';

const fakeFetch = (status: number, body: unknown, calls: Array<{ url: string; init?: RequestInit }>) => async (url: string, init?: RequestInit) => {
  calls.push({ url, init });
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
};

describe('Moyasar integration', () => {
  it('creates a hosted invoice with the amount in halalas and our callback addresses', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const r = await moyasarCreateInvoice(fakeFetch(201, { id: 'inv_1', url: 'https://moyasar.test/pay/inv_1' }, calls), 'sk_test_x', {
      amountHalalas: 228850,
      description: 'Jumaah Cloud JC-2026-00001',
      callbackUrl: 'https://cloud.jumaah.test/api/public/billing/moyasar/callback?invoice=abc',
      successUrl: 'https://cloud.jumaah.test/display/invoice/JC-2026-00001?t=tok&paid=1',
      backUrl: 'https://cloud.jumaah.test/display/invoice/JC-2026-00001?t=tok',
      jumaahInvoiceId: 'abc',
    });
    expect(r).toEqual({ id: 'inv_1', url: 'https://moyasar.test/pay/inv_1' });
    expect(calls[0].url).toBe('https://api.moyasar.com/v1/invoices');
    const headers = calls[0].init!.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from('sk_test_x:').toString('base64')}`);
    const body = JSON.parse(String(calls[0].init!.body));
    expect(body).toMatchObject({ amount: 228850, currency: 'SAR', metadata: { jumaah_invoice: 'abc' } });
    expect(body.callback_url).toContain('/api/public/billing/moyasar/callback?invoice=abc');
  });
  it('maps invoice states and surfaces API errors', async () => {
    expect(await moyasarInvoiceState(fakeFetch(200, { status: 'paid' }, []), 'k', 'inv_1')).toBe('paid');
    expect(await moyasarInvoiceState(fakeFetch(200, { status: 'initiated' }, []), 'k', 'inv_1')).toBe('pending');
    expect(await moyasarInvoiceState(fakeFetch(200, { status: 'expired' }, []), 'k', 'inv_1')).toBe('failed');
    await expect(moyasarInvoiceState(fakeFetch(401, { message: 'nope' }, []), 'k', 'inv_1')).rejects.toThrow('Moyasar 401');
  });
  it('falls back to manual payment without a secret key', () => {
    expect(paymentProviderName({ provider: 'moyasar', moyasarSecretKey: null })).toBe('manual');
    expect(paymentProviderName({ provider: 'moyasar', moyasarSecretKey: 'sk' })).toBe('moyasar');
    expect(paymentProviderName({ provider: 'manual', moyasarSecretKey: 'sk' })).toBe('manual');
  });
});

describe('Moyasar key check', () => {
  it('reports valid and invalid keys and the key mode', async () => {
    const { moyasarCheckKey } = await import('./payment.service.js');
    const ok = await moyasarCheckKey(async () => new Response('{"payments":[]}', { status: 200 }), 'sk_test_abc');
    expect(ok).toMatchObject({ ok: true, status: 200, mode: 'test' });
    const bad = await moyasarCheckKey(async () => new Response('{"message":"Invalid credentials"}', { status: 401 }), 'sk_live_abc');
    expect(bad).toMatchObject({ ok: false, status: 401, mode: 'live' });
    const down = await moyasarCheckKey(async () => { throw new Error('ECONNRESET'); }, 'weird');
    expect(down).toMatchObject({ ok: false, status: 0, mode: 'unknown', message: 'ECONNRESET' });
  });
});
