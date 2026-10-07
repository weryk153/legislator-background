// 從建置輸出的 HTML 抽出 <title> 與 <h1> 純文字，供改版前後比對 SEO 標題是否被改動。
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

function plain(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractHeadings(html: string): { title: string; h1: string[] } {
  const title = plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => plain(m[1]));
  return { title, h1 };
}
