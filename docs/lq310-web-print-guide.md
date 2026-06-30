# LQ-310 網頁列印 — 明天開工指南

> 目標:明天做出「網頁填表 → 預覽 → 從 LQ-310 印出一張」的可跑雛形
> 印表機:EPSON LQ-310(ESC/P2,24 針,USB/Serial/Parallel,**無網路埠**)

---

## 一、為什麼需要本地 agent(先理解架構)

LQ-310 沒有網路埠,瀏覽器又不能直接送 raw bytes 到 USB 印表機。所以架構必須是:

```
┌─────────────────┐     POST base64      ┌──────────────────┐    USB    ┌─────────┐
│   Next.js 網頁   │ ───── ESC/P ───────→ │  本地 print agent │ ───────→  │ LQ-310  │
│ (CRUD + 預覽)    │   http://localhost   │ (~50 行 Python)   │           │         │
└─────────────────┘                       └──────────────────┘           └─────────┘
```

**為什麼不用 WebUSB?**
- WebUSB 主要對熱感應 POS 印表機友善,傳統點陣機支援差
- 瀏覽器 API 會變(Chrome app 已停止支援過一次,壞掉風險高)
- 本地 agent + HTTP 是最穩、最不會哪天突然壞的路

---

## 二、本地 agent 的兩個選擇

### 選擇 A:現成開源(最快,推薦明天用)
**RawPrintingHTTPServer**(GitHub: lockerace/RawPrintingHTTPServer)
- Windows 應用程式,開一個 HTTP server 在 localhost
- 收 base64 → 轉 byte array → 送本地印表機
- 支援 ESC/POS / ESC/P 碼,搭配 Generic/Text Only 驅動
- 設定 `allowedDomains` 白名單 + `port`(預設 9100)
- 網頁端直接 `fetch('http://localhost:9100', {printer, data(base64), id})`

### 選擇 B:自己寫(約 50 行 Python,完全掌控)
參考 KwickPython 的做法,核心邏輯:
```python
# 需要 pip install pywin32
import win32print, base64

def print_raw(printer_name, b64_data):
    raw = base64.b64decode(b64_data)
    h = win32print.OpenPrinter(printer_name)
    job = win32print.StartDocPrinter(h, 1, ("送貨單", None, "RAW"))
    win32print.StartPagePrinter(h)
    win32print.WritePrinter(h, raw)
    win32print.EndPagePrinter(h)
    win32print.EndDocPrinter(h)
    win32print.ClosePrinter(h)
```
用 Flask 包一個 endpoint 收 POST,設好 CORS(`Access-Control-Allow-Origin`)就能跟網頁通。

> **明天建議:先用選擇 A 跑通,確認能印,再決定要不要自己寫。**

---

## 三、Windows 端前置設定(實機那台電腦)

這幾步要在「接 LQ-310 的那台 Windows 電腦」做:

1. 接上 USB,裝 **Generic / Text Only** 驅動(不要裝花俏的驅動,要的是 raw 通道)
   - 控制台 → 新增印表機 → 手動 → 廠商選「Generic」→「Generic / Text Only」
2. 記下印表機的「共享名稱」或「印表機名稱」(agent 要用)
3. 跑一次自我測試(關機狀態按住 LF/FF 開機)確認硬體 OK
4. 啟動 print agent,確認 localhost 那個 port 有通

---

## 四、ESC/P 關鍵指令速查(LQ-310 用 ESC/P2)

明天會用到的核心指令(Claude Code 可以幫你生大部分,但你要看得懂):

| 功能 | 指令(hex) | 說明 |
|---|---|---|
| 初始化印表機 | `ESC @` = `\x1B\x40` | 每次列印開頭必送,重置狀態 |
| 設定字元間距 10cpi | `ESC P` = `\x1B\x50` | 標準間距 |
| 設定字元間距 12cpi | `ESC M` = `\x1B\x4D` | 較密 |
| 設定行距 n/180 吋 | `ESC 3 n` = `\x1B\x33 n` | 精準控制垂直位置(對位關鍵) |
| 絕對水平位置 | `ESC $ nL nH` = `\x1B\x24` | 設定 X 座標(對位關鍵) |
| 換行 | `LF` = `\x0A` | 進一行 |
| 跳頁/送紙到下一頁 | `FF` = `\x0C` | 三聯單之間換頁 |
| 粗體開/關 | `ESC E` / `ESC F` | 強調文字 |

> **對位的核心** = 用 `ESC $`(水平)+ `ESC 3`(垂直)把每個欄位的文字「定位」到三聯單預印格子裡。這就是要實機慢慢調的部分。

---

## 五、明天的 step-by-step

```
上午:網頁雛形(不碰印表機)
├─ 1. npx create-next-app,起一個空專案
├─ 2. 做 CRUD 表格:品名 / 尺寸 / 數量 / 單價,可新增多列
├─ 3. 自動算每列小計 + 總額
└─ 4. 做一個「預覽框」用 CSS 模擬三聯單版面

下午:接印表機
├─ 5. 接 USB + 裝 Generic/Text driver
├─ 6. 下載 RawPrintingHTTPServer 跑起來
├─ 7. 寫一個最簡單的 ESC/P 產生器(先印「品名 + 總額」就好)
├─ 8. 網頁按「列印」→ base64 → POST 到 localhost → 印出來
└─ 9. 看印出來的位置,調 ESC $ / ESC 3 的座標

收工標準:
✅ 能在網頁填一張單
✅ 能預覽
✅ 按列印,LQ-310 真的吐出一張紙(位置先不要求完美)
```

---

## 六、明天先「不做」什麼(避免卡住)

| 先不做 | 為什麼 |
|---|---|
| autocomplete | 你說了之後做資料匯入再用,明天純 input 就好 |
| 存資料庫 | 明天先 useState 在記憶體,跑通流程優先 |
| 登入 | 雛形階段不需要 |
| 完美對位 | 第一天能印出來就贏了,對位第二天再磨 |
| 三聯完整版面 | 先印一聯(品名+總額)驗證通道,再擴成三聯 |

---

## 七、預期會卡的點(先有心理準備)

1. **Generic/Text driver 沒裝對** → 印出亂碼或不印。確認驅動是「Generic / Text Only」
2. **usblp 佔用(Linux)** → 若用 Linux 當 agent,要 unload usblp kernel module
3. **CORS 擋掉** → agent 要設 `Access-Control-Allow-Origin` 允許你的網頁網域
4. **中文字** → ESC/P2 的中文要確認 code page,第一版可以先全英數驗證通道
5. **對位偏移** → 紙張裝載每次有 1-2mm 誤差,這是點陣機天性,不是你的 bug

---

## 八、給工時估算的回饋

明天這個雛形做完,你會對「點陣機這塊到底多難」有真實手感。原本報價裡點陣機抓 14 hr,做完明天的雛形後你可以校正:
- 如果一天就印出對位 OK 的三聯 → 14 hr 太高,可以降
- 如果光對位就花掉一整天 → 14 hr 剛好甚至要加

**這就是「先做 PoC 再定價」的價值 — 明天的雛形會讓你的報價更準。**

---

## 參考連結
- RawPrintingHTTPServer: github.com/lockerace/RawPrintingHTTPServer
- KwickPython(50 行範例): kwickpos.com/opensource/
- ESC/P2 指令參考:Epson 官方 ESC/P Reference Manual

---

*明天開工指南 · 2026/05*
