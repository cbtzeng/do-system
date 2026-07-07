# LQ-310 本機 print agent(跨平台:Mac + Windows)

在客戶工廠電腦上跑一個小型 HTTP server(`http://localhost:9100`),
接收瀏覽器送來的 base64 ESC/P2 bytes 或 PNG,轉成 raw ESC/P,直接送到
USB 連接的 **EPSON LQ-310**(24 針點陣印表機)。

- **macOS / Linux**:走 CUPS `lp -d <printer> -o raw`。
- **Windows**:走 `win32print`(pywin32)RAW passthrough。
- 依 `sys.platform` **自動偵測** OS,同一份程式碼兩邊都能跑。

## HTTP 契約

| Method | Path | Body | 回應 |
| --- | --- | --- | --- |
| POST | `/print` | `{printer, data(base64 ESC/P2)}` | `{ok, job_id}` / `{ok:false, error}` |
| POST | `/print-image` | `{printer, image(base64 PNG), width_dots?}` | `{ok, job_id}` / `{ok:false, error}` |
| GET | `/printers` | — | `{printers: [...]}` |

CORS 允許的 origin 由環境變數 **`ALLOWED_ORIGINS`**(逗號分隔)控制,
預設 `http://localhost:3000`。

## 架構

```
app.py              Flask HTTP 層(契約、驗證、CORS)
printer_backend.py  跨平台抽象:list_printers() / send_raw(printer, data) -> job_id
escp_image.py       PNG → ESC/P2 24-pin bit-image
```

`app.py` 只呼叫 `printer_backend.list_printers()` 與
`printer_backend.send_raw()`,不直接碰 CUPS / win32print。printer 名稱一律
以「參數 / API 引數」傳遞,**絕不做 shell 字串插值**,也不使用 `shell=True`。

---

## 設定 CORS(`ALLOWED_ORIGINS`)

部署到 Vercel 後,網站在 `https://your-app.vercel.app`,但仍透過
`fetch http://localhost:9100` 呼叫本機 agent。要讓瀏覽器放行,必須把
Vercel 網域加進 `ALLOWED_ORIGINS`:

```
# Mac / Linux
export ALLOWED_ORIGINS="http://localhost:3000,https://your-app.vercel.app"

# Windows (PowerShell)
$env:ALLOWED_ORIGINS = "http://localhost:3000,https://your-app.vercel.app"

# Windows (cmd)
set ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app
```

未設定時預設只允許 `http://localhost:3000`(本機開發用)。

---

## Windows 安裝與打包

### 1. 以「Generic / Text Only」驅動安裝 LQ-310(必要)

RAW passthrough 要直接把 ESC/P bytes 丟給印表機,**不能**經 Windows 圖形
驅動再轉一次,否則 ESC/P 控制碼會被吃掉。因此 LQ-310 要用
**Generic / Text Only** 驅動安裝:

1. 設定 → 藍牙與裝置 → 印表機與掃描器 → 新增裝置 →「我想要的印表機不在
   清單中」。
2. 選「以手動設定新增本機印表機」,連接埠選 LQ-310 的 USB 埠
   (通常 `USB001`)。
3. 廠商選 **Generic**,印表機選 **Generic / Text Only**。
4. 完成後,記下印表機名稱(agent 的 `printer` 欄位就用這個名稱;
   也可呼叫 `GET /printers` 取得清單)。

### 2. 安裝相依套件

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

`requirements.txt` 裡的 `pywin32` 帶了 `sys_platform == "win32"` marker,
所以只有在 Windows 上才會被安裝(Mac 上 `pip install` 會自動略過)。

### 3. 打包成單一 `.exe`(PyInstaller)

```
pip install pyinstaller
pyinstaller --onefile app.py
```

產物在 `dist\app.exe`。雙擊即可啟動 agent(監聽 `127.0.0.1:9100`)。
若要在打包時就固定 CORS 網域,可先設好 `ALLOWED_ORIGINS` 環境變數,
或用批次檔啟動(見下)。

> 提示:PyInstaller 通常能自動收進 `win32print`、`flask`、`PIL`。若
> 執行時報缺 module,可加 `--hidden-import win32print`。

### 4. 開機自動啟動

做一個 `start-agent.bat`:

```bat
@echo off
set ALLOWED_ORIGINS=http://localhost:3000,https://your-app.vercel.app
"%~dp0dist\app.exe"
```

把這個 `.bat`(或它的捷徑)放進「啟動」資料夾即可開機自動跑:

1. 按 `Win + R`,輸入 `shell:startup`,Enter。
2. 把 `start-agent.bat` 的捷徑丟進開啟的資料夾。

登入 Windows 後 agent 會自動在背景啟動。

---

## macOS 安裝與啟動

### 1. venv + 相依套件

```bash
cd print-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt   # pywin32 會因 marker 自動略過
```

### 2. 確認 LQ-310 已在 CUPS(raw queue)

Mac 端已用 `raw.ppd`(Generic Raw Queue)驗證過。用
`lpstat -p` 或 `GET /printers` 確認印表機名稱。

### 3. 啟動腳本

`start-agent.sh`:

```bash
#!/usr/bin/env bash
cd "$(dirname "$0")"
source .venv/bin/activate
export ALLOWED_ORIGINS="http://localhost:3000,https://your-app.vercel.app"
exec python app.py
```

```bash
chmod +x start-agent.sh
./start-agent.sh
```

### 4. 保持常駐(login 自動啟動)

用 `launchd`,建立
`~/Library/LaunchAgents/com.dosystem.printagent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.dosystem.printagent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/absolute/path/to/print-agent/start-agent.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.dosystem.printagent.plist
```

登入時會自動啟動並在崩潰後重啟。

---

## 開發 / 測試

```bash
source .venv/bin/activate
pytest -q
```

測試全程 mock `printer_backend`(HTTP 層)與 CUPS / win32print(backend 層),
**不需真實印表機,也不需在 Mac 上安裝 pywin32** 即可跑完 Windows 路徑。
