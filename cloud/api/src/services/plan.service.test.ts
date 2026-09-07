import { describe, expect, it } from 'vitest';
import { PLAN_LIMITS } from '@jumaah/cloud-shared';
import { allowanceOf, assertAiAllowed, monthKey, subscriptionState } from './plan.service.js';

const day = 86_400_000;
const now = new Date('2026-09-05T10:00:00Z');
const t = (plan: string, status: string, endsAt: Date | null) => ({ plan, subscriptionStatus: status, subscriptionEndsAt: endsAt });

describe('subscriptionState', () => {
  it('is active before the end date and on open-ended active plans', () => {
    expect(subscriptionState(t('STANDARD', 'ACTIVE', new Date(now.getTime() + 30 * day)), now)).toBe('active');
    expect(subscriptionState(t('STANDARD', 'ACTIVE', null), now)).toBe('active');
    expect(subscriptionState(t('STANDARD', 'TRIAL', new Date(now.getTime() + day)), now)).toBe('active');
  });
  it('keeps AI on for seven days after the end date, then expires', () => {
    expect(subscriptionState(t('STANDARD', 'ACTIVE', new Date(now.getTime() - 3 * day)), now)).toBe('grace');
    expect(subscriptionState(t('STANDARD', 'ACTIVE', new Date(now.getTime() - 8 * day)), now)).toBe('expired');
  });
  it('suspended always wins', () => {
    expect(subscriptionState(t('PRO', 'SUSPENDED', new Date(now.getTime() + 30 * day)), now)).toBe('suspended');
  });
});

describe('allowanceOf', () => {
  it('excludes AI on Basic and Free regardless of status', () => {
    for (const plan of ['FREE', 'BASIC']) {
      const a = allowanceOf(t(plan, 'ACTIVE', null), 0, true, now);
      expect(a.allowed).toBe(false);
      expect(a.reason).toBe('NOT_INCLUDED');
      expect(a.aiIncluded).toBe(false);
    }
  });
  it('allows Standard within the month and reports the remaining allowance', () => {
    const a = allowanceOf(t('STANDARD', 'ACTIVE', new Date(now.getTime() + 20 * day)), 100, true, now);
    expect(a.allowed).toBe(true);
    expect(a.monthlyParagraphs).toBe(PLAN_LIMITS.STANDARD.monthlyParagraphs);
    expect(a.remainingParagraphs).toBe(PLAN_LIMITS.STANDARD.monthlyParagraphs! - 100);
    expect(a.month).toBe('2026-09');
    expect(a.maxLanguages).toBe(4);
  });
  it('denies when the month is used up, expired or suspended', () => {
    expect(allowanceOf(t('STANDARD', 'ACTIVE', null), PLAN_LIMITS.STANDARD.monthlyParagraphs!, true, now).reason).toBe('QUOTA');
    expect(allowanceOf(t('STANDARD', 'ACTIVE', new Date(now.getTime() - 10 * day)), 0, true, now).reason).toBe('EXPIRED');
    expect(allowanceOf(t('PRO', 'SUSPENDED', null), 0, true, now).reason).toBe('SUSPENDED');
    expect(allowanceOf(t('STANDARD', 'ACTIVE', new Date(now.getTime() - 2 * day)), 0, true, now)).toMatchObject({ state: 'grace', allowed: true });
  });
  it('never gates a self-hosted server', () => {
    const a = allowanceOf(t('FREE', 'TRIAL', null), 0, false, now);
    expect(a.applies).toBe(false);
    expect(a.allowed).toBe(true);
    expect(a.reason).toBeNull();
    expect(() => assertAiAllowed(a, 9, 100_000)).not.toThrow();
  });
});

describe('assertAiAllowed', () => {
  const std = allowanceOf(t('STANDARD', 'ACTIVE', null), 800, true, now); // 100 left of 900
  it('accepts jobs inside the plan', () => {
    expect(() => assertAiAllowed(std, 4, 100)).not.toThrow();
  });
  it('rejects too many languages with AI_LANGUAGES', () => {
    expect(() => assertAiAllowed(std, 5, 10)).toThrow(expect.objectContaining({ status: 403, code: 'AI_LANGUAGES' }));
  });
  it('rejects more paragraphs than remain with AI_QUOTA', () => {
    expect(() => assertAiAllowed(std, 2, 101)).toThrow(expect.objectContaining({ status: 403, code: 'AI_QUOTA' }));
  });
  it('Pro has no language limit', () => {
    const pro = allowanceOf(t('PRO', 'ACTIVE', null), 0, true, now);
    expect(() => assertAiAllowed(pro, 12, 500)).not.toThrow();
  });
});

describe('monthKey', () => {
  it('is the UTC calendar month', () => {
    expect(monthKey(new Date('2026-09-30T23:30:00Z'))).toBe('2026-09');
    expect(monthKey(new Date('2026-10-01T00:00:00Z'))).toBe('2026-10');
  });
});
