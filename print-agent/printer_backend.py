"""跨平台印表機後端(Issue #17)。

把「列出印表機」與「送 raw bytes」抽象成兩個函式,依 OS 自動選路:

- macOS / Linux:CUPS
    - list_printers(): `lpstat -p` 解析印表機名稱
    - send_raw():     `lp -d <printer> -o raw`,raw bytes 走 stdin
- Windows:win32print(pywin32)
    - list_printers(): `EnumPrinters`
    - send_raw():     `OpenPrinter` / `StartDocPrinter(..., ("do", None, "RAW"))`
                      / `WritePrinter` / `EndDocPrinter`

共同介面:
    list_printers() -> list[str]
    send_raw(printer: str, data: bytes) -> str   # 回傳 job_id

安全性:printer 名稱一律以「參數 / API 引數」傳遞,絕不做 shell 字串插值,
也不使用 shell=True。

在 Mac 上 import 本模組不會 import win32print(受 sys.platform 保護),
所以測試不需安裝 pywin32 即可跑。
"""

import re
import subprocess
import sys

# 是否為 Windows 平台。集中在此,方便測試 monkeypatch。
IS_WINDOWS = sys.platform.startswith("win")


class PrinterError(Exception):
    """列印 / 列表失敗。app 層會轉成 HTTP 錯誤回應。"""


# --------------------------------------------------------------------------
# CUPS 後端(macOS / Linux)
# --------------------------------------------------------------------------


def _cups_parse_job_id(stdout: str) -> str:
    """從 `lp` stdout 解析 request id。

    `lp` 典型輸出: "request id is EPSON_LQ-310-42 (1 file(s))"
    回傳 "EPSON_LQ-310-42";解析不到時回傳整段(去除前後空白)。
    """
    if not stdout:
        return ""
    m = re.search(r"request id is (\S+)", stdout)
    if m:
        return m.group(1)
    return stdout.strip()


def _cups_parse_printers(stdout: str) -> list:
    """從 `lpstat -p` 輸出解析印表機名稱。

    典型行: "printer EPSON_LQ-310 is idle.  enabled since ..."
    """
    printers = []
    for line in stdout.splitlines():
        m = re.match(r"printer (\S+)", line)
        if m:
            printers.append(m.group(1))
    return printers


def _cups_list_printers() -> list:
    try:
        result = subprocess.run(["lpstat", "-p"], capture_output=True)
    except FileNotFoundError:
        raise PrinterError("lpstat command not found")
    stdout = (result.stdout or b"").decode("utf-8", "replace")
    return _cups_parse_printers(stdout)


def _cups_send_raw(printer: str, data: bytes) -> str:
    """`lp -d <printer> -o raw`,raw bytes 走 stdin。

    以 list 傳參,絕不用 shell=True / 字串插值,printer 名稱安全。
    """
    cmd = ["lp", "-d", printer, "-o", "raw"]
    try:
        result = subprocess.run(cmd, input=data, capture_output=True)
    except FileNotFoundError:
        raise PrinterError("lp command not found")

    if result.returncode != 0:
        err = (result.stderr or b"").decode("utf-8", "replace").strip()
        raise PrinterError(err or "lp failed")

    stdout = (result.stdout or b"").decode("utf-8", "replace")
    return _cups_parse_job_id(stdout)


# --------------------------------------------------------------------------
# win32print 後端(Windows)
# --------------------------------------------------------------------------
#
# 注意:LQ-310 必須以「Generic / Text Only」驅動安裝,才能做 RAW passthrough
# (直接把 ESC/P bytes 丟給印表機,不經 Windows 圖形驅動再轉一次)。詳見 README。
#
# win32print 只在 Windows 上 import;Mac / Linux 不會碰到這段,測試也不需要
# 安裝 pywin32。


def _win_list_printers() -> list:
    import win32print

    # 列本機 + 已連線印表機。flags 用 LOCAL | CONNECTIONS。
    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    # level 1:回傳 (flags, description, name, comment) tuples,name 在 index 2。
    infos = win32print.EnumPrinters(flags, None, 1)
    return [info[2] for info in infos]


def _win_send_raw(printer: str, data: bytes) -> str:
    import win32print

    handle = win32print.OpenPrinter(printer)
    try:
        # doc info:(DocName, OutputFile, DataType)。DataType="RAW" → passthrough。
        job_id = win32print.StartDocPrinter(handle, 1, ("do", None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, data)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)
    return str(job_id)


# --------------------------------------------------------------------------
# 公開介面 — 依平台自動選路
# --------------------------------------------------------------------------


def list_printers() -> list:
    """回傳可用印表機名稱清單。"""
    if IS_WINDOWS:
        return _win_list_printers()
    return _cups_list_printers()


def send_raw(printer: str, data: bytes) -> str:
    """把 raw bytes 送到指定印表機,回傳 job_id(字串)。

    失敗時 raise PrinterError。
    """
    if IS_WINDOWS:
        return _win_send_raw(printer, data)
    return _cups_send_raw(printer, data)
