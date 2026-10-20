# 分享圖卡字型

這些靜態字型供建置時的 Resvg 使用，不依賴部署主機安裝的字型。

- `NotoSerifTC-Regular.ttf`：由 Google Fonts 的 [Noto Serif TC](https://github.com/google/fonts/tree/main/ofl/notoseriftc) 可變字型，以 fontTools 固定為 `wght=400`。授權見 `OFL-NotoSerifTC.txt`。
- `NotoSerifTC-Black.ttf`：同一字型固定為 `wght=900`，供直式人物卡沿用網站粗明朝標題；只在直式卡載入，不影響橫式卡快取。
- `civic-rare-bmp.ttf`、`civic-rare-ext.ttf`：現有同名 WOFF2 字型解壓成 TTF，保留專案的全字庫罕見字子集。來源與授權見 `public/fonts/cns-sung-LICENSE.txt`。
- `CivicShareFallback.otf`：由 [Noto Serif CJK TC Regular](https://github.com/notofonts/noto-cjk/tree/main/Serif/OTF/TraditionalChinese) 擷取「鳯佀勲区姗」，子集重新命名為 Civic Share Fallback。授權見 `OFL-NotoSerifCJK.txt`。
- `CivicPortraitFallback.otf`：同一來源擷取較完整學經歷所需的「乡磜飮」，重新命名為 Civic Portrait Fallback；只供直式卡使用。
- `CivicShareLatin.ttf`：由專案安裝的 `@fontsource-variable/public-sans` Latin Extended 字型固定為 `wght=400`，擷取 U+02BC「ʼ」，子集重新命名為 Civic Share Latin。授權見 `public/fonts/public-sans-LICENSE.txt`。

2026-10-20 已以 fontTools 的 Unicode cmap 檢查全部 2,115 張圖卡文字，沒有缺字。新增人物或變更圖卡內容後，應重新檢查字元覆蓋，並抽驗長姓名及原住民姓名的實際 PNG。

圖卡生成器將 SVG 與全部字型內容的雜湊作為快取鍵，快取位於 `.astro/share-card-cache/`。資料、排版或字型變更會自動重新生成圖片。
