/** 未經核對的來源造字不能猜字；只在顯示時明示缺字，保留原始資料。 */
const PRIVATE_USE = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;
export function displaySourceText(value: string): string {
  return value.replace(PRIVATE_USE, '〔缺字〕');
}
export function hasSourceMissingGlyph(value: string): boolean {
  return displaySourceText(value) !== value;
}
