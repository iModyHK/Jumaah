import { describe, expect, it } from 'vitest';
import { checkDns, cnameTarget, normalizeDomain, type Resolver } from './domain.service.js';

const cfg = { PUBLIC_BASE_URL: 'https://cloud.jumaah.test', tenantBaseDomain: 'jumaah.test' };

const dnsError = (code: string) => Object.assign(new Error(code), { code });
const fake = (cname: string[] | Error, a: Record<string, string[] | Error>): Resolver => ({
  resolveCname: async () => {
    if (cname instanceof Error) throw cname;
    return cname;
  },
  resolve4: async (h) => {
    const v = a[h];
    if (!v) throw dnsError('ENOTFOUND');
    if (v instanceof Error) throw v;
    return v;
  },
});

describe('normalizeDomain', () => {
  it('lower-cases, strips the trailing dot and accepts ordinary host names', () => {
    expect(normalizeDomain(' Khutbah.AlNoor.org. ', cfg)).toEqual({ domain: 'khutbah.alnoor.org', error: null });
    expect(normalizeDomain('alnoor.org.sa', cfg).domain).toBe('alnoor.org.sa');
  });
  it('refuses the platform, the base domain and anything under it, and malformed names', () => {
    for (const d of ['jumaah.test', 'demo.jumaah.test', 'a.b.jumaah.test', 'cloud.jumaah.test']) expect(normalizeDomain(d, cfg).error).toBe('PLATFORM_DOMAIN');
    for (const d of ['localhost', 'no spaces.org', '-bad.org', 'x.123', 'http://alnoor.org', '']) expect(normalizeDomain(d, cfg).error).toBe('INVALID_HOSTNAME');
  });
  it('names the CNAME target', () => {
    expect(cnameTarget(cfg, 'demo')).toBe('demo.jumaah.test');
    expect(cnameTarget({ tenantBaseDomain: null }, 'demo')).toBeNull();
  });
});

describe('checkDns', () => {
  const target = 'demo.jumaah.test';
  it('accepts a CNAME to the mosque host (any case, trailing dot)', async () => {
    expect(await checkDns('khutbah.alnoor.org', target, fake(['Demo.Jumaah.Test.'], {}))).toEqual({ ok: true, error: null });
  });
  it('reports a CNAME pointing elsewhere', async () => {
    expect(await checkDns('khutbah.alnoor.org', target, fake(['other.example.'], {}))).toEqual({ ok: false, error: 'WRONG_TARGET:other.example' });
  });
  it('accepts an A record equal to the target address when there is no CNAME', async () => {
    const r = fake(dnsError('ENODATA'), { [target]: ['203.0.113.10'], 'khutbah.alnoor.org': ['203.0.113.10'] });
    expect(await checkDns('khutbah.alnoor.org', target, r)).toEqual({ ok: true, error: null });
  });
  it('reports an A record pointing elsewhere, a missing record and resolver failures', async () => {
    expect(await checkDns('x.org', target, fake(dnsError('ENODATA'), { [target]: ['203.0.113.10'], 'x.org': ['198.51.100.1'] }))).toEqual({ ok: false, error: 'WRONG_TARGET:198.51.100.1' });
    expect(await checkDns('x.org', target, fake(dnsError('ENOTFOUND'), { [target]: ['203.0.113.10'] }))).toEqual({ ok: false, error: 'NO_RECORD' });
    expect(await checkDns('x.org', target, fake(dnsError('ETIMEOUT'), {}))).toEqual({ ok: false, error: 'DNS_ERROR:ETIMEOUT' });
  });
});
