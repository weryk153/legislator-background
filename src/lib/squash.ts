// 壓扁特粗明朝（tokens.css 的 .sq）用 transform: scaleX 壓扁，但 transform 不改版面寬度，
// 壓扁後右側會留一截空白。.sq 以 margin-right: (k-1) × n × .97em 收回，n 就是這裡算的
// 「未壓扁寬度」（以全形字＝1 為單位）。估大會讓負 margin 收過頭、字吃出黑卡；估小則右側
// 留白、窄螢幕縮字不夠而溢出。原住民族拉丁拼音姓名（如 Iwan·Sigiy）各字母寬差很多，
// 所以半形字用逐字實測表。
//
// HALF_WIDTH_N：Noto Serif TC 900、letter-spacing -.03em 下，以瀏覽器量得的每字寬度（em）
// 除以 .97（全形字含字距的寬）。字型換了要重量：在頁面上把「一X一」減「一一」的寬度量一遍。
const HALF_WIDTH_CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~·";
const HALF_WIDTH_N = [0.224, 0.361, 0.508, 0.625, 0.598, 0.988, 0.809, 0.255, 0.4, 0.4, 0.473, 0.603, 0.32, 0.363, 0.32, 0.407, 0.6, 0.446, 0.601, 0.6, 0.6, 0.601, 0.601, 0.596, 0.601, 0.602, 0.32, 0.32, 0.603, 0.603, 0.603, 0.478, 1.0, 0.754, 0.719, 0.699, 0.793, 0.664, 0.646, 0.759, 0.866, 0.42, 0.425, 0.779, 0.64, 1.014, 0.82, 0.789, 0.68, 0.789, 0.763, 0.6, 0.705, 0.824, 0.736, 1.114, 0.731, 0.699, 0.627, 0.368, 0.407, 0.368, 0.603, 0.596, 0.436, 0.587, 0.679, 0.566, 0.663, 0.573, 0.391, 0.6, 0.691, 0.338, 0.327, 0.663, 0.346, 1.026, 0.688, 0.626, 0.679, 0.646, 0.505, 0.497, 0.388, 0.681, 0.58, 0.89, 0.605, 0.586, 0.511, 0.364, 0.329, 0.364, 0.603, 0.32];
const HALF_WIDTH = new Map([...HALF_WIDTH_CHARS].map((ch, i) => [ch, HALF_WIDTH_N[i]]));

export function squashWidth(text: string): number {
  let w = 0;
  // 表外的半形字（拉丁擴充等）以小寫平均寬 0.6 計；其餘視為全形 1。
  for (const ch of text) w += HALF_WIDTH.get(ch) ?? (/[\u0021-\u024f]/.test(ch) ? 0.6 : 1);
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
