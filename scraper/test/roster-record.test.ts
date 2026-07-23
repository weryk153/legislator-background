import { describe, it, expect } from 'vitest';
import { validateOp, generateCouncilorSlug } from '../lib/roster-record-lib';

describe('generateCouncilorSlug', () => {
  it('joins name/party/district with the c- prefix matching existing councilor slugs', () => {
    expect(generateCouncilorSlug('戴瑋姍', '民進黨', '新北市第05選舉區')).toBe('c-戴瑋姍-民進黨-新北市第05選舉區');
  });
});

describe('validateOp: rename', () => {
  const base = {
    op: 'rename', from: '戴瑋姗', to: '戴瑋姍', office_type: 'councilor', district: '新北市第05選舉區',
    source_url: 'https://example.com', source_title: '新北市議會',
  };
  it('accepts a well-formed rename op', () => {
    expect(validateOp(base)).toEqual({ ok: true });
  });
  it('accepts rename without the optional note', () => {
    expect(validateOp(base)).toEqual({ ok: true });
  });
  it('rejects missing "to"', () => {
    const { to, ...rest } = base;
    const r = validateOp(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('to');
  });
  it('rejects missing source_url', () => {
    const { source_url, ...rest } = base;
    const r = validateOp(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('source_url');
  });
});

describe('validateOp: depart', () => {
  const base = {
    op: 'depart', name: '黃俊哲', office_type: 'councilor', district: '新北市第05選舉區',
    reason: '2024年8月當選無效判決確定', source_url: 'https://example.com', source_title: '中央社', date: '2024-08-30',
  };
  it('accepts a well-formed depart op', () => {
    expect(validateOp(base)).toEqual({ ok: true });
  });
  it('rejects missing reason', () => {
    const { reason, ...rest } = base;
    const r = validateOp(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('reason');
  });
  it('rejects missing date', () => {
    const { date, ...rest } = base;
    const r = validateOp(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('date');
  });
});

describe('validateOp: add', () => {
  const base = {
    op: 'add', name: '石一佑', office_type: 'councilor', district: '新北市第05選舉區', party: '民進黨', term: '11',
    career_title: '遞補就任', career_org: '新北市議會', start_date: '2024-09-25',
    source_url: 'https://example.com', source_title: '中央社',
  };
  it('accepts a well-formed add op', () => {
    expect(validateOp(base)).toEqual({ ok: true });
  });
  it('rejects missing party', () => {
    const { party, ...rest } = base;
    const r = validateOp(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('party');
  });
  it('rejects missing career_title and career_org together', () => {
    const { career_title, career_org, ...rest } = base;
    const r = validateOp(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join()).toContain('career_title');
      expect(r.errors.join()).toContain('career_org');
    }
  });
});

describe('validateOp: generic', () => {
  it('rejects unknown op', () => {
    const r = validateOp({ op: 'add_successor', name: 'x' });
    expect(r.ok).toBe(false);
  });
  it('rejects non-object input', () => {
    expect(validateOp(null).ok).toBe(false);
    expect(validateOp('rename').ok).toBe(false);
  });
  it('rejects invalid office_type', () => {
    const r = validateOp({
      op: 'depart', name: '黃俊哲', office_type: 'president', district: '新北市第05選舉區',
      reason: 'x', source_url: 'https://example.com', source_title: 'x', date: '2024-08-30',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('office_type');
  });
});
