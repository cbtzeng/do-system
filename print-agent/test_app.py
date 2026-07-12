"""print agent 測試 (Issue #3, 跨平台 #17)。

HTTP 層透過 mock `printer_backend.list_printers` / `send_raw` 測試,不需真實印表機,
也不需在 Mac 上安裝 win32print。另有 backend 層測試分別覆蓋 CUPS 與 Windows 路徑。
"""

import base64
import io
import subprocess
from unittest.mock import patch

import pytest
from PIL import Image

import app as app_module
import printer_backend


def _tiny_png(size=(12, 8)):
    """做一張很小的真實 PNG(黑白棋盤),供 /print-image 測試。"""
    img = Image.new("RGB", size, (255, 255, 255))
    for y in range(size[1]):
        for x in range(size[0]):
            if (x + y) % 2 == 0:
                img.putpixel((x, y), (0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def client():
    app_module.app.config.update(TESTING=True)
    return app_module.app.test_client()


def _completed(returncode=0, stdout=b"", stderr=b""):
    return subprocess.CompletedProcess(
        args=[], returncode=returncode, stdout=stdout, stderr=stderr
    )


# ==========================================================================
# HTTP 層(mock printer_backend,平台無關)
# ==========================================================================

# ---------------------------------------------------------------- /print


def test_print_decodes_base64_and_calls_send_raw(client):
    raw = b"\x1b@hello ESC/P2"  # 任意 ESC/P2 bytes
    data = base64.b64encode(raw).decode("ascii")

    with patch.object(printer_backend, "send_raw", return_value="EPSON_LQ-310-42") as mock_send:
        resp = client.post(
            "/print", json={"printer": "EPSON_LQ-310", "data": data}
        )

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True
    assert body["job_id"] == "EPSON_LQ-310-42"

    # 驗證解出的 raw bytes 原封不動送進 backend。
    mock_send.assert_called_once_with("EPSON_LQ-310", raw)


def test_print_malformed_base64_returns_error(client):
    resp = client.post(
        "/print", json={"printer": "EPSON_LQ-310", "data": "!!!not base64!!!"}
    )
    assert resp.status_code == 400
    body = resp.get_json()
    assert body["ok"] is False
    assert "error" in body


@pytest.mark.parametrize(
    "payload",
    [
        {"data": base64.b64encode(b"x").decode()},  # 缺 printer
        {"printer": "EPSON_LQ-310"},  # 缺 data
        {},  # 都缺
    ],
)
def test_print_missing_fields_returns_error(client, payload):
    resp = client.post("/print", json=payload)
    assert resp.status_code == 400
    body = resp.get_json()
    assert body["ok"] is False
    assert "error" in body


def test_print_backend_error_returns_500(client):
    data = base64.b64encode(b"x").decode("ascii")
    with patch.object(
        printer_backend, "send_raw",
        side_effect=printer_backend.PrinterError("lp: error - unknown printer"),
    ):
        resp = client.post("/print", json={"printer": "nope", "data": data})

    assert resp.status_code == 500
    body = resp.get_json()
    assert body["ok"] is False
    assert "unknown printer" in body["error"]


# ---------------------------------------------------------- /print-image


def test_print_image_renders_png_and_calls_send_raw(client):
    png = _tiny_png()
    image = base64.b64encode(png).decode("ascii")

    with patch.object(printer_backend, "send_raw", return_value="EPSON_LQ-310-7") as mock_send:
        resp = client.post(
            "/print-image",
            json={"printer": "EPSON_LQ-310", "image": image, "width_dots": 120},
        )

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True
    assert body["job_id"] == "EPSON_LQ-310-7"

    # backend 收到的是 escp_image 產出的 ESC/P bytes(非原始 PNG)。
    (printer_arg, sent), _ = mock_send.call_args
    assert printer_arg == "EPSON_LQ-310"
    assert isinstance(sent, (bytes, bytearray))
    assert sent[:2] == b"\x1b@"  # ESC @ 初始化,證明是 ESC/P 而非 PNG
    assert sent.endswith(b"\x0c")  # FF 換頁
    assert sent != png


def test_print_image_accepts_data_url_prefix(client):
    png = _tiny_png()
    data_url = "data:image/png;base64," + base64.b64encode(png).decode("ascii")

    with patch.object(printer_backend, "send_raw", return_value="p-9"):
        resp = client.post(
            "/print-image", json={"printer": "p", "image": data_url}
        )

    assert resp.status_code == 200
    assert resp.get_json()["ok"] is True


def test_print_image_bad_base64_returns_error(client):
    resp = client.post(
        "/print-image", json={"printer": "p", "image": "!!!not base64!!!"}
    )
    assert resp.status_code == 400
    body = resp.get_json()
    assert body["ok"] is False
    assert "error" in body


def test_print_image_non_png_bytes_returns_error(client):
    # 合法 base64 但不是圖片 → Pillow 開檔失敗 → 回報錯誤,不呼叫 backend。
    junk = base64.b64encode(b"not really a png").decode("ascii")
    with patch.object(printer_backend, "send_raw") as mock_send:
        resp = client.post("/print-image", json={"printer": "p", "image": junk})
    assert resp.status_code == 400
    assert resp.get_json()["ok"] is False
    mock_send.assert_not_called()


@pytest.mark.parametrize(
    "payload",
    [
        {"image": "x"},  # 缺 printer
        {"printer": "p"},  # 缺 image
        {},  # 都缺
    ],
)
def test_print_image_missing_fields_returns_error(client, payload):
    resp = client.post("/print-image", json=payload)
    assert resp.status_code == 400
    body = resp.get_json()
    assert body["ok"] is False
    assert "error" in body


# ------------------------------------------------------------- /printers


def test_printers_returns_backend_list(client):
    with patch.object(
        printer_backend, "list_printers",
        return_value=["EPSON_LQ-310", "Brother_HL"],
    ):
        resp = client.get("/printers")

    assert resp.status_code == 200
    assert resp.get_json()["printers"] == ["EPSON_LQ-310", "Brother_HL"]


def test_printers_backend_error_returns_500_empty(client):
    with patch.object(
        printer_backend, "list_printers",
        side_effect=printer_backend.PrinterError("lpstat command not found"),
    ):
        resp = client.get("/printers")
    assert resp.status_code == 500
    assert resp.get_json()["printers"] == []


# ------------------------------------------------------------------ CORS


def test_cors_header_present_on_response(client):
    data = base64.b64encode(b"x").decode("ascii")
    with patch.object(printer_backend, "send_raw", return_value="p-1"):
        resp = client.post(
            "/print",
            json={"printer": "p", "data": data},
            headers={"Origin": "http://localhost:3000"},
        )
    assert (
        resp.headers.get("Access-Control-Allow-Origin")
        == "http://localhost:3000"
    )


def test_cors_preflight_options(client):
    resp = client.options(
        "/print",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )
    assert resp.status_code in (200, 204)
    assert (
        resp.headers.get("Access-Control-Allow-Origin")
        == "http://localhost:3000"
    )


def test_allowed_origins_default():
    """無 env 時 = 內建預設(localhost + 部署的 Vercel 網域)。"""
    with patch.dict("os.environ", {}, clear=False):
        import os
        os.environ.pop("ALLOWED_ORIGINS", None)
        assert app_module._allowed_origins() == app_module.DEFAULT_ORIGINS


def test_allowed_origins_from_env():
    """env 會併入內建預設,不覆蓋;重複來源去重。"""
    with patch.dict(
        "os.environ",
        {"ALLOWED_ORIGINS": "http://localhost:3000, https://extra.example.com"},
    ):
        result = app_module._allowed_origins()
        # 內建預設全在
        for o in app_module.DEFAULT_ORIGINS:
            assert o in result
        # 新來源被加入
        assert "https://extra.example.com" in result
        # localhost 未重複
        assert result.count("http://localhost:3000") == 1


# ==========================================================================
# backend 層 — CUPS 路徑(macOS / Linux)
# ==========================================================================


def test_cups_send_raw_calls_lp_with_raw_stdin():
    raw = b"\x1b@hello"
    with patch.object(printer_backend, "IS_WINDOWS", False), patch.object(
        printer_backend.subprocess, "run"
    ) as mock_run:
        mock_run.return_value = _completed(
            returncode=0, stdout=b"request id is EPSON_LQ-310-42 (1 file(s))\n"
        )
        job_id = printer_backend.send_raw("EPSON_LQ-310", raw)

    assert job_id == "EPSON_LQ-310-42"
    args, kwargs = mock_run.call_args
    assert args[0] == ["lp", "-d", "EPSON_LQ-310", "-o", "raw"]
    assert kwargs["input"] == raw


def test_cups_send_raw_nonzero_raises():
    with patch.object(printer_backend, "IS_WINDOWS", False), patch.object(
        printer_backend.subprocess, "run"
    ) as mock_run:
        mock_run.return_value = _completed(
            returncode=1, stdout=b"", stderr=b"lp: error - unknown printer\n"
        )
        with pytest.raises(printer_backend.PrinterError) as exc:
            printer_backend.send_raw("nope", b"x")
    assert "unknown printer" in str(exc.value)


def test_cups_list_printers_parses_lpstat():
    lpstat_out = (
        "printer EPSON_LQ-310 is idle.  enabled since Tue 01 Jul 2026\n"
        "printer Brother_HL is idle.  enabled since Tue 01 Jul 2026\n"
    )
    with patch.object(printer_backend, "IS_WINDOWS", False), patch.object(
        printer_backend.subprocess, "run"
    ) as mock_run:
        mock_run.return_value = _completed(
            returncode=0, stdout=lpstat_out.encode("utf-8")
        )
        printers = printer_backend.list_printers()

    assert printers == ["EPSON_LQ-310", "Brother_HL"]
    args, _ = mock_run.call_args
    assert args[0] == ["lpstat", "-p"]


# ==========================================================================
# backend 層 — Windows 路徑(win32print 全 mock,Mac 上也能跑)
# ==========================================================================


def _install_fake_win32print(monkeypatch):
    """塞一個假的 win32print module,讓 Windows 路徑在 Mac 上可測。"""
    import sys as _sys
    import types

    calls = {"write": None, "startdoc": None, "opened": None, "closed": False}

    fake = types.ModuleType("win32print")
    fake.PRINTER_ENUM_LOCAL = 2
    fake.PRINTER_ENUM_CONNECTIONS = 4

    def enum_printers(flags, name, level):
        # level 1 tuples:(flags, description, name, comment)
        return [
            (0, "desc", "EPSON_LQ-310", ""),
            (0, "desc", "Microsoft Print to PDF", ""),
        ]

    def open_printer(printer):
        calls["opened"] = printer
        return "HANDLE"

    def start_doc_printer(handle, level, docinfo):
        calls["startdoc"] = docinfo
        return 77

    def write_printer(handle, data):
        calls["write"] = data
        return len(data)

    def close_printer(handle):
        calls["closed"] = True

    fake.EnumPrinters = enum_printers
    fake.OpenPrinter = open_printer
    fake.StartDocPrinter = start_doc_printer
    fake.StartPagePrinter = lambda h: None
    fake.WritePrinter = write_printer
    fake.EndPagePrinter = lambda h: None
    fake.EndDocPrinter = lambda h: None
    fake.ClosePrinter = close_printer

    monkeypatch.setitem(_sys.modules, "win32print", fake)
    return calls


def test_windows_send_raw_uses_win32print(monkeypatch):
    calls = _install_fake_win32print(monkeypatch)
    monkeypatch.setattr(printer_backend, "IS_WINDOWS", True)

    raw = b"\x1b@windows raw"
    job_id = printer_backend.send_raw("EPSON_LQ-310", raw)

    assert job_id == "77"
    assert calls["opened"] == "EPSON_LQ-310"
    # RAW datatype 是關鍵:確保 passthrough 不經圖形驅動。
    assert calls["startdoc"] == ("do", None, "RAW")
    assert calls["write"] == raw
    assert calls["closed"] is True


def test_windows_list_printers_uses_enumprinters(monkeypatch):
    _install_fake_win32print(monkeypatch)
    monkeypatch.setattr(printer_backend, "IS_WINDOWS", True)

    printers = printer_backend.list_printers()
    assert printers == ["EPSON_LQ-310", "Microsoft Print to PDF"]
