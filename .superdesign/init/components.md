# Shared primitives
## src/components/TitleCard.astro
```
---
// 黑標題卡（EVA 標題卡構圖）：左側直排朱紅小字，右側兩行大小對比的壓扁字。
// 語意標題與視覺字串不同時（縣市頁、個人頁的 h1 字串為 SEO 調過，不能改），
// 視覺字串 aria-hidden、語意標題以 sr-only 保留。直排字永遠在標題元素外。
// 兩行之間不留空白文字節點，標題元素的 textContent 才會等於 lines.join("")。
import { fitStyle } from "../lib/squash";

interface Props {
  vertical: string;
  lines: [string] | [string, string];
  heading?: string;
  as?: "h1" | "h2";
  href?: string;
  variant?: "default" | "feature";
  fitContainer?: boolean;
}
const { vertical, lines, heading, as: Tag = "h1", href, variant = "default", fitContainer = false } = Astro.props;
// 大字 84px／小字 38px，壓扁 .62；窄螢幕扣掉槽寬 48、卡片內距 36、直排欄 24＋間距 10 ≈ 120px 後依寬度縮字。
const titleStyle = (text: string, maxPx: number, line: "first" | "second") => {
  // 個人頁使用並排欄位，依父層 inline-size container 縮字，避免長姓名溢出。
  const fitted = fitContainer
    ? fitStyle(text, 0.62, maxPx, 76).replace("100vw", "100cqw")
    : fitStyle(text, 0.62, maxPx, 120);
  // 特色字卡可由容器控制響應式尺寸，其他頁保留原本的縮字規則。
  return variant === "feature"
    ? fitted.replace(/font-size:(.*)$/, `font-size:var(--feature-${line}-size,$1)`)
    : fitted;
};
const l1 = titleStyle(lines[0], variant === "feature" ? 96 : 84, "first");
const l2 = lines[1] ? titleStyle(lines[1], 38, "second") : null;
const Wrap = href ? "a" : "div";
---
<Wrap class="tcard" href={href}>
  <span class="tcard-v" aria-hidden="true">{vertical}</span>
  {heading ? (
    <>
      <span class="tcard-body" aria-hidden="true"><span class="tcard-line"><span class="sq tcard-l1" style={l1}>{lines[0]}</span></span>{l2 && <span class="tcard-line"><span class="sq tcard-l2" style={l2}>{lines[1]}</span></span>}</span>
      <Tag class="sr-only">{heading}</Tag>
    </>
  ) : (
    <Tag class="tcard-body"><span class="tcard-line"><span class="sq tcard-l1" style={l1}>{lines[0]}</span></span>{l2 && <span class="tcard-line"><span class="sq tcard-l2" style={l2}>{lines[1]}</span></span>}</Tag>
  )}
</Wrap>

```

## src/components/SectionHead.astro
```
---
// 章節標：黑塊（壓扁字）＋延伸到欄寬的粗線。取代各頁原本的 h2 樣式。
import { squashStyle } from "../lib/squash";

interface Props { text: string; id?: string; level?: 2 | 3 }
const { text, id, level = 2 } = Astro.props;
const Tag = level === 3 ? "h3" : "h2";
---
<Tag class="sh" id={id}><span class="sh-text"><span class="sq" style={squashStyle(text)}>{text}</span></span></Tag>

```

## src/components/Sources.astro
```
---
import type { Source } from "../lib/types";
const { sources } = Astro.props as { sources: Source[] };

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
// Generic ref titles ("報導/原始出處") are uninformative when repeated — show the
// source's domain instead. Keep meaningful titles (維基百科, 立法院/中選會/監察院…).
// Then dedupe by the displayed label so a single outlet doesn't repeat many times.
// Show original-media sources before Wikipedia (Wikipedia is secondary; the credible
// primary report should lead). Stable sort preserves the original order within each group.
const isWiki = (url: string) => /wikipedia\.org/.test(url || "");
const seen = new Set<string>();
const shown = [...(sources ?? [])]
  .sort((a, b) => (isWiki(a.url) ? 1 : 0) - (isWiki(b.url) ? 1 : 0))
  .map((s) => ({ url: s.url, label: s.title && s.title !== "報導/原始出處" ? s.title : hostname(s.url) }))
  .filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true)));
---
<div class="sources">
  <span class="lbl">出處</span>
  {shown.map((s, i) => (
    <a href={s.url} target="_blank" rel="noopener">{s.label}{i < shown.length - 1 ? "、" : ""}</a>
  ))}
</div>

<style>
  .sources { font-size: var(--t-sm); color: var(--muted); margin-top: 8px; }
  .lbl {
    font-size: var(--t-xs); letter-spacing: 0.1em; color: var(--faint);
    margin-right: 6px;
  }
  .sources a { text-decoration: underline; text-underline-offset: 2px; text-decoration-color: var(--line-strong); }
  .sources a:hover { color: var(--accent); text-decoration-color: var(--accent); }
</style>

```