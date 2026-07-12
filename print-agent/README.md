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

CORS 允許的 origin **內建**了 `http://localhost:3000` 與部署的 Vercel 網域
`https://do-system-theta.vercel.app`(打包成 exe 後客戶端**零設定**即可讓
線上網站呼叫本機列印)。要再加來源可設環境變數 **`ALLOWED_ORIGINS`**
(逗號分隔,會**併入**內建預設,不覆蓋)。

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

部署的 Vercel 網站(`https://do-system-theta.vercel.app`)透過
`fetch http://localhost:9100` 呼叫本機 agent。此網域**已內建**在允許清單,
所以**預設就通、不用設定**。

只有在**換 Vercel 網域**或要**額外加來源**時才需設 `ALLOWED_ORIGINS`
(會併入內建預設):

```
# Mac / Linux
export ALLOWED_ORIGINS="https://my-new-domain.vercel.app"

# Windows (PowerShell)
$env:ALLOWED_ORIGINS = "https://my-new-domain.vercel.app"

# Windows (cmd)
set ALLOWED_ORIGINS=https://my-new-domain.vercel.app
```

---

## 不用 Windows 電腦也能拿到 exe(GitHub Actions)

Repo 內建 `.github/workflows/build-agent.yml`:在雲端的 **Windows runner**
自動用 PyInstaller 打包 exe,你**直接從 GitHub 下載**,不必自備 Windows 機器。

1. GitHub → **Actions** 分頁 → 「**build-windows-agent**」→ **Run workflow**
   (或每次改到 `print-agent/` 推上去就會自動跑)。
2. 跑完進該次 run → **Artifacts** → 下載 `do-print-agent-windows`
   (內含 `do-print-agent.exe`)。
3. 把 exe 拷到客戶那台 Windows,雙擊即可(見下方「Windows 安裝」設印表機)。

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
pyinstaller --onefile --name do-print-agent ^
  --hidden-import win32print --hidden-import win32timezone --hidden-import pywintypes ^
  app.py
```

產物在 `dist\do-print-agent.exe`。雙擊即可啟動 agent(監聽
`127.0.0.1:9100`)。CORS 已內建 Vercel 網域,**客戶端不用設定**。

> `printer_backend.py` 是**延遲匯入** `win32print`,PyInstaller 靜態分析可能
> 收不到,所以上面用 `--hidden-import` 明確帶入(GitHub Actions 的打包
> 指令已包含這些)。

### 4. 開機自動啟動

Repo 附了 `start-agent.bat`(直接執行同資料夾的 exe):

```bat
@echo off
REM CORS 已內建;要加別的來源才需下一行(取消註解):
REM set ALLOWED_ORIGINS=https://my-new-domain.vercel.app
"%~dp0do-print-agent.exe"
```

把 exe 與 `start-agent.bat` 放同一資料夾,再把 `.bat` 的捷徑丟進「啟動」:

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
