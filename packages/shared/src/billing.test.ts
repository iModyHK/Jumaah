import { describe, expect, it } from 'vitest';
import { addCycle, bulkPerMosqueMonthly, computeTotals, priceFor, zatcaQr } from './billing.js';

describe('billing rules', () => {
  it('prices plans monthly and yearly (ten months)', () => {
    expect(priceFor('STANDARD', 'MONTHLY')).toBe(19900);
    expect(priceFor('STANDARD', 'YEARLY')).toBe(199000);
    expect(priceFor('PRO', 'YEARLY')).toBe(399000);
    expect(priceFor('FREE', 'MONTHLY')).toBe(0);
  });
  it('bulk tiers', () => {
    expect(bulkPerMosqueMonthly(10)).toBeNull();
    expect(bulkPerMosqueMonthly(25)).toBe(149);
    expect(bulkPerMosqueMonthly(99)).toBe(149);
    expect(bulkPerMosqueMonthly(100)).toBe(119);
  });
  it('adds VAT on top, rounded to the halala', () => {
    expect(computeTotals(199000, 0.15)).toEqual({ subtotal: 199000, vat: 29850, total: 228850 });
    expect(computeTotals(7900, 0)).toEqual({ subtotal: 7900, vat: 0, total: 7900 });
    expect(computeTotals(3333, 0.15).vat).toBe(500);
  });
  it('periods end a calendar month or year later', () => {
    expect(addCycle(new Date('2026-01-31T00:00:00Z'), 'MONTHLY').toISOString()).toBe('2026-03-03T00:00:00.000Z');
    expect(addCycle(new Date('2026-09-11T00:00:00Z'), 'YEARLY').toISOString()).toBe('2027-09-11T00:00:00.000Z');
  });
  it('encodes the ZATCA TLV as base64', () => {
    const qr = zatcaQr({ sellerName: 'Jumaah', vatNumber: '300000000000003', timestamp: new Date('2026-09-11T10:00:00Z'), totalHalalas: 228850, vatHalalas: 29850 });
    const bytes = Uint8Array.from(atob(qr), (c) => c.charCodeAt(0));
    // tag 1, length 6, "Jumaah"
    expect(Array.from(bytes.slice(0, 2))).toEqual([1, 6]);
    expect(new TextDecoder().decode(bytes.slice(2, 8))).toBe('Jumaah');
    // tag 2 follows with the 15-digit VAT number
    expect(Array.from(bytes.slice(8, 10))).toEqual([2, 15]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('2288.50');
    expect(text).toContain('298.50');
  });
});
