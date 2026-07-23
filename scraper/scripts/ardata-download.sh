#!/bin/bash
# ardata.cy.gov.tw 整批下載：現任席次相關選舉 × 縣市，抓「會計報告書 CSV」(DownloadType=3)。
# 端點見 scraper/fixtures/ardata-notes.md。ZIP 內含 incomes.csv / expenditures.csv（逐筆明細）
# 與收支結算表摘要；本腳本只留兩個明細檔，攤平命名為 <選舉>_<縣市>_incomes|expenditures.csv。
# 查無資料的組合回傳的 ZIP 解不開或無明細檔 → 靜默跳過。1 秒間隔禮貌抓取。可重跑（已存在則跳過）。
set -u
cd "$(dirname "$0")/../out-ardata" || exit 1
UA='legislator-background-bot/1.0 (public-data; +https://github.com/weryk153/legislator-background)'
BASE='https://ardata.cy.gov.tw/api/v1/Search/download'

ALL_AREAS=(臺北市 新北市 桃園市 臺中市 臺南市 高雄市 基隆市 宜蘭縣 新竹市 新竹縣 苗栗縣 彰化縣 南投縣 雲林縣 嘉義市 嘉義縣 屏東縣 臺東縣 花蓮縣 澎湖縣 金門縣 連江縣 平地原住民 山地原住民)
DIRECT=(臺北市 新北市 桃園市 臺中市 臺南市 高雄市)
COUNTIES=(基隆市 宜蘭縣 新竹市 新竹縣 苗栗縣 彰化縣 南投縣 雲林縣 嘉義市 嘉義縣 屏東縣 臺東縣 花蓮縣 澎湖縣 金門縣 連江縣)

fetch() { # fetch <選舉名稱> <縣市>
  local election="$1" area="$2"
  local key="${election}_${area}"
  [ -f "${key}_incomes.csv" ] && { echo "= ${key} 已存在"; return; }
  local tmp; tmp=$(mktemp -d)
  local code
  code=$(curl -sL -A "$UA" -o "$tmp/pkg.zip" -w '%{http_code}' --get \
    --data-urlencode "ElectionName=${election}" --data-urlencode "ElectionArea=${area}" \
    --data-urlencode "AccountNumber=" --data-urlencode "YearOrSerial=1" \
    --data-urlencode "Version=" --data-urlencode "SearchType=2" --data-urlencode "DownloadType=3" \
    "$BASE")
  if [ "$code" = "200" ] && unzip -qq -o "$tmp/pkg.zip" -d "$tmp" 2>/dev/null && [ -f "$tmp/incomes.csv" ]; then
    mv "$tmp/incomes.csv" "${key}_incomes.csv"
    [ -f "$tmp/expenditures.csv" ] && mv "$tmp/expenditures.csv" "${key}_expenditures.csv"
    echo "● ${key}"
  else
    echo "⤫ ${key} (http ${code})"
  fi
  rm -rf "$tmp"
  sleep 1
}

for a in "${ALL_AREAS[@]}"; do fetch 113年立法委員選舉 "$a"; done
for a in "${COUNTIES[@]}";  do fetch '111年縣(市)議員選舉' "$a"; done
for a in "${DIRECT[@]}";    do fetch 111年直轄市議員選舉 "$a"; done
for a in "${COUNTIES[@]}";  do fetch '111年縣(市)長選舉' "$a"; done
for a in "${DIRECT[@]}";    do fetch 111年直轄市市長選舉 "$a"; done
fetch 第20屆臺東縣議員補選 臺東縣
fetch 第4屆臺中市議員補選 臺中市

echo; echo "完成：$(ls -1 *_incomes.csv 2>/dev/null | wc -l | tr -d ' ') 個 incomes 檔"
