// 壓扁特粗明朝（tokens.css 的 .sq）用 transform: scaleX 壓扁，但 transform 不改版面寬度，
// 壓扁後右側會留一截空白。.sq 以 margin-right: (k-1) × n × .97em 收回，n 就是這裡算的
// 「未壓扁寬度（em）」。半形字只有約 0.56em 寬，若一律當 1em 算，負 margin 會收過頭、
// 吃掉後面的字。
const HALF_WIDTH = /[ -ɏ]/;

export function squashWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += HALF_WIDTH.test(ch) ? 0.56 : 1;
  return Math.round(w * 100) / 100;
}

export function squashStyle(text: string, k = 0.7): string {
  return `--k:${k};--n:${squashWidth(text)}`;
}

/** 標題卡、報頭這類單行大字：桌機用 maxPx，窄螢幕依可用寬度（100vw 扣掉 reservePx）縮字，不換行也不溢出。 */
export function fitStyle(text: string, k: number, maxPx: number, reservePx: number): string {
  const units = Math.round(squashWidth(text) * k * 100) / 100;
  return `${squashStyle(text, k)};font-size:min(${maxPx}px, calc((100vw - ${reservePx}px) / ${units}))`;
}
