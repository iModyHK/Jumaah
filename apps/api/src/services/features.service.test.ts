import { describe, expect, it } from 'vitest';
import { assertBrandingAllowed, effectiveBranding, tenantFeatures } from './features.service.js';

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
    expect(() => assertBrandingAllowed({ logoDataUrl: 'data:image/png;base64,AAAA' }, t('BASIC'))).not.toThrow();
    expect(() => assertBrandingAllowed({ primary: '#112233', css: null, hideMark: false }, t('STANDARD'))).not.toThrow();
    expect(() => assertBrandingAllowed({ css: 'body{}', hideMark: true }, t('PRO'))).not.toThrow();
    expect(() => assertBrandingAllowed(undefined, t('FREE'))).not.toThrow();
  });
  it('rejects fields above the plan with FEATURE_NOT_IN_PLAN', () => {
    expect(() => assertBrandingAllowed({ primary: '#112233' }, t('BASIC'))).toThrow(expect.objectContaining({ status: 403, code: 'FEATURE_NOT_IN_PLAN' }));
    expect(() => assertBrandingAllowed({ css: 'body{}' }, t('STANDARD'))).toThrow(expect.objectContaining({ code: 'FEATURE_NOT_IN_PLAN' }));
    expect(() => assertBrandingAllowed({ logoDataUrl: 'data:image/png;base64,AAAA' }, t('FREE'))).toThrow(expect.objectContaining({ code: 'FEATURE_NOT_IN_PLAN' }));
  });
});

describe('effectiveBranding', () => {
  const settings = { logoUrl: 'https://mosque.example/logo.png', branding: { logoDataUrl: 'data:image/png;base64,AAAA', primary: '#112233', accent: '#445566', css: 'body{}', hideMark: true } };
  it('gives Pro everything', () => {
    expect(effectiveBranding(settings, t('PRO'))).toEqual({ logoUrl: 'data:image/png;base64,AAAA', primary: '#112233', accent: '#445566', css: 'body{}', hideMark: true });
  });
  it('filters by plan and falls back to the plain logo URL', () => {
    expect(effectiveBranding(settings, t('STANDARD'))).toEqual({ logoUrl: 'data:image/png;base64,AAAA', primary: '#112233', accent: '#445566', css: null, hideMark: false });
    expect(effectiveBranding(settings, t('FREE'))).toEqual({ logoUrl: 'https://mosque.example/logo.png', primary: null, accent: null, css: null, hideMark: false });
  });
  it('a lapsed Pro falls back to the neutral look without editing settings', () => {
    expect(effectiveBranding(settings, t('PRO', 'ACTIVE', new Date(Date.now() - 30 * day))).css).toBeNull();
  });
});
