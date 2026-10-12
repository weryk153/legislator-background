import { describe, expect, it } from 'vitest';
import { displaySourceText, hasSourceMissingGlyph } from '../src/lib/sourceText';
import { CEC_NAME_CORRECTIONS, normalizeCecCandidateName } from '../scraper/lib/cecNameCorrections';

describe('來源造字', () => {
  it.each(CEC_NAME_CORRECTIONS)('還原經核對的 $name', ({ raw, name }) => {
    expect(normalizeCecCandidateName(raw)).toBe(name);
    expect(normalizeCecCandidateName(name)).toBe(name);
    expect(hasSourceMissingGlyph(name)).toBe(false);
  });
  it('未知造字在顯示時明示缺字，但不變更原始姓名或誤套中選會字碼', () => {
    const name = '劉宜\uE8CD';
    expect(normalizeCecCandidateName(name)).toBe(name);
    expect(displaySourceText(name)).toBe('劉宜〔缺字〕');
    expect(displaySourceText('甲\u{F0000}\u{100000}')).toBe('甲〔缺字〕〔缺字〕');
  });
  it('保留標準 Unicode 罕見字', () => {
    expect(displaySourceText('林𬧷昌、廖𫎇歆、吳佳𠧊、許𡍼燕雀')).toBe('林𬧷昌、廖𫎇歆、吳佳𠧊、許𡍼燕雀');
  });
});
