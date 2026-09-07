import { describe, expect, it } from 'vitest';
import { assertBrandingAllowed, effectiveBranding, effectiveSignage } from '@jumaah/api';
import { tenantFeatures } from './features.js';

const f = (x: Parameters<typeof tenantFeatures>[0]) => tenantFeatures(x).features;

const day = 86_400_000;
const t = (plan: string, status = 'ACTIVE', endsAt: Date | null = null) => ({ plan, subscriptionStatus: status, subscriptionEndsAt: endsAt });

describe('tenantFeatures', () => {
  it('follows the plan while the subscription is active or in grace', () => {
    expect(tenantFeatures(t('FREE')).features.logoUpload).toBe(false);
    expect(tenantFeatures(t('BASIC')).features).toMatchObject({ logoUpload: true, poster: true, colours: false, css: false });
    expect(tenantFeatures(t('STANDARD')).features).toMatchObject({ colours: true, signage: true, css: false, hideMark: false });
    expect(tenantFeatures(t('PRO')).features).toMatchObject({ css: true, hideMark: true, networkPublish: true, api: true });
    expect(tenantFeatures(t('PRO', 'ACTIVE', new Date(Date.now() - 2 * day))).features.css).toBe(true);
  });
  it('drops every paid feature once expired or suspended', () => {
    expect(tenantFeatures(t('PRO', 'ACTIVE', new Date(Date.now() - 10 * day))).features.logoUpload).toBe(false);
    expect(tenantFeatures(t('PRO', 'SUSPENDED')).features.poster).toBe(false);
  });
});

describe('assertBrandingAllowed', () => {
  it('accepts fields inside the plan and any clearing', () => {
    expect(() => assertBrandingAllowed({ logoDataUrl: 'data:image/png;base64,AAAA' }, f(t('BASIC')))).not.toThrow();
    expect(() => assertBrandingAllowed({ primary: '#112233', css: null, hideMark: false }, f(t('STANDARD')))).not.toThrow();
    expect(() => assertBrandingAllowed({ css: 'body{}', hideMark: true }, f(t('PRO')))).not.toThrow();
    expect(() => assertBrandingAllowed(undefined, f(t('FREE')))).not.toThrow();
  });
  it('rejects fields above the plan with FEATURE_NOT_AVAILABLE', () => {
    expect(() => assertBrandingAllowed({ primary: '#112233' }, f(t('BASIC')))).toThrow(expect.objectContaining({ status: 403, code: 'FEATURE_NOT_AVAILABLE' }));
    expect(() => assertBrandingAllowed({ css: 'body{}' }, f(t('STANDARD')))).toThrow(expect.objectContaining({ code: 'FEATURE_NOT_AVAILABLE' }));
    expect(() => assertBrandingAllowed({ logoDataUrl: 'data:image/png;base64,AAAA' }, f(t('FREE')))).toThrow(expect.objectContaining({ code: 'FEATURE_NOT_AVAILABLE' }));
  });
});

describe('effectiveBranding', () => {
  const settings = { logoUrl: 'https://mosque.example/logo.png', branding: { logoDataUrl: 'data:image/png;base64,AAAA', primary: '#112233', accent: '#445566', css: 'body{}', hideMark: true } };
  it('gives Pro everything', () => {
    expect(effectiveBranding(settings, f(t('PRO')))).toEqual({ logoUrl: 'data:image/png;base64,AAAA', primary: '#112233', accent: '#445566', css: 'body{}', hideMark: true });
  });
  it('filters by plan and falls back to the plain logo URL', () => {
    expect(effectiveBranding(settings, f(t('STANDARD')))).toEqual({ logoUrl: 'data:image/png;base64,AAAA', primary: '#112233', accent: '#445566', css: null, hideMark: false });
    expect(effectiveBranding(settings, f(t('FREE')))).toEqual({ logoUrl: 'https://mosque.example/logo.png', primary: null, accent: null, css: null, hideMark: false });
  });
  it('a lapsed Pro falls back to the neutral look without editing settings', () => {
    expect(effectiveBranding(settings, f(t('PRO', 'ACTIVE', new Date(Date.now() - 30 * day)))).css).toBeNull();
  });
});

describe('effectiveSignage', () => {
  const day = 86_400_000;
  const now = new Date('2026-09-05T10:00:00Z');
  const settings = {
    signage: {
      showDate: true,
      announcements: [
        { id: 'a', textAr: 'نص', textEn: 'text', enabled: true },
        { id: 'b', textAr: 'قديم', textEn: '', until: '2026-09-04', enabled: true },
        { id: 'c', textAr: '', textEn: 'future', from: '2026-09-06', enabled: true },
        { id: 'd', textAr: 'x', textEn: '', enabled: false },
        { id: 'e', textAr: 'اليوم', textEn: '', from: '2026-09-05', until: '2026-09-05', enabled: true },
      ],
    },
  };
  const t = (plan: string, endsAt: Date | null = null) => ({ plan, subscriptionStatus: 'ACTIVE', subscriptionEndsAt: endsAt, timezone: 'Asia/Riyadh' });
  it('keeps today\'s enabled announcements in order on plans with signage', () => {
    expect(effectiveSignage(settings, f(t('STANDARD')), 'Asia/Riyadh', now)).toEqual({ showDate: true, announcements: [{ id: 'a', textAr: 'نص', textEn: 'text' }, { id: 'e', textAr: 'اليوم', textEn: '' }] });
  });
  it('is empty on plans without signage or after expiry', () => {
    expect(effectiveSignage(settings, f(t('BASIC')), 'Asia/Riyadh', now)).toEqual({ showDate: false, announcements: [] });
    expect(effectiveSignage(settings, f(t('PRO', new Date(now.getTime() - 30 * day))), 'Asia/Riyadh', now)).toEqual({ showDate: false, announcements: [] });
  });
});
