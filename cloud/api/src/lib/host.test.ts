import { describe, expect, it } from 'vitest';
import { hostnameOf, isAllowedOrigin, tenantPublicBaseUrl, tenantSlugFromHost } from './host.js';

const BASE = 'jumaah.net';

describe('hostnameOf', () => {
  it('strips the port and lower-cases', () => {
    expect(hostnameOf('AlNoor.Jumaah.net:443')).toBe('alnoor.jumaah.net');
    expect(hostnameOf(['x.jumaah.net', 'y.jumaah.net'])).toBe('x.jumaah.net');
  });
  it('rejects missing, empty and IPv6 hosts', () => {
    expect(hostnameOf(undefined)).toBeNull();
    expect(hostnameOf('')).toBeNull();
    expect(hostnameOf('[::1]:4000')).toBeNull();
    expect(hostnameOf('bad host')).toBeNull();
  });
});

describe('tenantSlugFromHost', () => {
  it('returns the label under the base domain', () => {
    expect(tenantSlugFromHost('alnoor.jumaah.net', BASE)).toBe('alnoor');
    expect(tenantSlugFromHost('al-noor-2.jumaah.net:8443', BASE)).toBe('al-noor-2');
  });
  it('returns null for the base domain, reserved labels, deeper subdomains and other domains', () => {
    expect(tenantSlugFromHost('jumaah.net', BASE)).toBeNull();
    expect(tenantSlugFromHost('www.jumaah.net', BASE)).toBeNull();
    expect(tenantSlugFromHost('api.jumaah.net', BASE)).toBeNull();
    expect(tenantSlugFromHost('a.b.jumaah.net', BASE)).toBeNull();
    expect(tenantSlugFromHost('alnoor.jumaah.com', BASE)).toBeNull();
    expect(tenantSlugFromHost('evil-jumaah.net', BASE)).toBeNull();
    expect(tenantSlugFromHost('-bad.jumaah.net', BASE)).toBeNull();
  });
  it('is disabled without a base domain', () => {
    expect(tenantSlugFromHost('alnoor.jumaah.net', null)).toBeNull();
  });
});

describe('tenantPublicBaseUrl', () => {
  it('uses the tenant host in the hosted edition', () => {
    expect(tenantPublicBaseUrl({ PUBLIC_BASE_URL: 'https://cloud.jumaah.net', tenantBaseDomain: BASE }, 'alnoor')).toBe('https://alnoor.jumaah.net');
  });
  it('keeps plain http for local platforms', () => {
    expect(tenantPublicBaseUrl({ PUBLIC_BASE_URL: 'http://localhost:8080', tenantBaseDomain: 'jumaah.test' }, 'demo')).toBe('http://demo.jumaah.test');
  });
  it('falls back to PUBLIC_BASE_URL without a base domain or with an invalid slug', () => {
    expect(tenantPublicBaseUrl({ PUBLIC_BASE_URL: 'http://192.168.1.10:8080/', tenantBaseDomain: null }, 'alnoor')).toBe('http://192.168.1.10:8080');
    expect(tenantPublicBaseUrl({ PUBLIC_BASE_URL: 'https://cloud.jumaah.net', tenantBaseDomain: BASE }, 'Bad Slug')).toBe('https://cloud.jumaah.net');
  });
});

describe('isAllowedOrigin', () => {
  const cfg = { PUBLIC_BASE_URL: 'https://cloud.jumaah.net', corsOrigins: ['http://localhost:5173'], tenantBaseDomain: BASE };
  it('allows configured origins, the platform host and tenant hosts', () => {
    expect(isAllowedOrigin(undefined, cfg)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', cfg)).toBe(true);
    expect(isAllowedOrigin('https://cloud.jumaah.net', cfg)).toBe(true);
    expect(isAllowedOrigin('https://jumaah.net', cfg)).toBe(true);
    expect(isAllowedOrigin('https://www.jumaah.net', cfg)).toBe(true);
    expect(isAllowedOrigin('https://alnoor.jumaah.net', cfg)).toBe(true);
  });
  it('rejects look-alike and foreign origins', () => {
    expect(isAllowedOrigin('https://alnoor.jumaah.net.evil.com', cfg)).toBe(false);
    expect(isAllowedOrigin('https://evil-jumaah.net', cfg)).toBe(false);
    expect(isAllowedOrigin('https://a.b.jumaah.net', cfg)).toBe(false);
    expect(isAllowedOrigin('ftp://alnoor.jumaah.net', cfg)).toBe(false);
    expect(isAllowedOrigin('not a url', cfg)).toBe(false);
  });
  it('keeps the old behaviour without a base domain', () => {
    expect(isAllowedOrigin('https://anything.example', { PUBLIC_BASE_URL: 'http://localhost:8080', corsOrigins: [], tenantBaseDomain: null })).toBe(true);
    expect(isAllowedOrigin('https://anything.example', { PUBLIC_BASE_URL: 'http://localhost:8080', corsOrigins: ['http://a'], tenantBaseDomain: null })).toBe(false);
  });
});

import { customDomainCandidate, tenantBaseUrlFor } from './host.js';

describe('custom domains: tenantBaseUrlFor / customDomainCandidate', () => {
  const cfg = { PUBLIC_BASE_URL: 'https://cloud.jumaah.test', tenantBaseDomain: 'jumaah.test', corsOrigins: [] as string[] };
  it('prefers a verified custom domain, else the tenant host, else PUBLIC_BASE_URL', () => {
    expect(tenantBaseUrlFor(cfg, { slug: 'demo', customDomain: 'khutbah.alnoor.org', customDomainVerifiedAt: new Date() })).toBe('https://khutbah.alnoor.org');
    expect(tenantBaseUrlFor(cfg, { slug: 'demo', customDomain: 'khutbah.alnoor.org', customDomainVerifiedAt: null })).toBe('https://demo.jumaah.test');
    expect(tenantBaseUrlFor(cfg, { slug: 'demo' })).toBe('https://demo.jumaah.test');
    expect(tenantBaseUrlFor({ ...cfg, tenantBaseDomain: null }, { slug: 'demo', customDomain: 'khutbah.alnoor.org', customDomainVerifiedAt: new Date() })).toBe('https://cloud.jumaah.test');
  });
  it('spots hosts that could be a custom domain and ignores platform, base-domain and local hosts', () => {
    expect(customDomainCandidate('Khutbah.AlNoor.org:443', cfg)).toBe('khutbah.alnoor.org');
    for (const h of ['demo.jumaah.test', 'jumaah.test', 'cloud.jumaah.test', 'localhost:4000', '127.0.0.1', 'api', undefined]) expect(customDomainCandidate(h, cfg)).toBeNull();
    expect(customDomainCandidate('khutbah.alnoor.org', { ...cfg, tenantBaseDomain: null })).toBeNull();
  });
});
