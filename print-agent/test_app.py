"""print agent 測試 (Issue #3)。

全程 mock subprocess,使測試不需真實印表機即可執行。
"""

import base64
import subprocess
from unittest.mock import patch

import pytest

import app as app_module


@pytest.fixture
def client():
    app_module.app.config.update(TESTING=True)
    return app_module.app.test_client()


def _completed(returncode=0, stdout=b"", stderr=b""):
    return subprocess.CompletedProcess(
        args=[], returncode=returncode, stdout=stdout, stderr=stderr
    )


# ---------------------------------------------------------------- /print


def test_print_decodes_base64_and_calls_lp_with_raw_stdin(client):
    raw = b"\x1b@hello ESC/P2"  # 任意 ESC/P2 bytes
    data = base64.b64encode(raw).decode("ascii")

    with patch.object(app_module.subprocess, "run") as mock_run:
        mock_run.return_value = _completed(
            returncode=0, stdout=b"request id is EPSON_LQ-310-42 (1 file(s))\n"
        )
        resp = client.post(
            "/print", json={"printer": "EPSON_LQ-310", "data": data}
        )

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["ok"] is True
    assert body["job_id"] == "EPSON_LQ-310-42"

    # 驗證以 list 傳參、-d/-o raw、raw bytes 走 stdin
    args, kwargs = mock_run.call_args
    assert args[0] == ["lp", "-d", "EPSON_LQ-310", "-o", "raw"]
    assert kwargs["input"] == raw


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


def test_print_lp_nonzero_returns_error(client):
    data = base64.b64encode(b"x").decode("ascii")
    with patch.object(app_module.subprocess, "run") as mock_run:
        mock_run.return_value = _completed(
            returncode=1, stdout=b"", stderr=b"lp: error - unknown printer\n"
        )
        resp = client.post(
            "/print", json={"printer": "nope", "data": data}
        )

    assert resp.status_code == 500
    body = resp.get_json()
    assert body["ok"] is False
    assert "unknown printer" in body["error"]


# ------------------------------------------------------------- /printers


def test_printers_parses_lpstat_output(client):
    lpstat_out = (
        "printer EPSON_LQ-310 is idle.  enabled since Tue 01 Jul 2026\n"
        "printer Brother_HL is idle.  enabled since Tue 01 Jul 2026\n"
    )
    with patch.object(app_module.subprocess, "run") as mock_run:
        mock_run.return_value = _completed(
            returncode=0, stdout=lpstat_out.encode("utf-8")
        )
        resp = client.get("/printers")

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["printers"] == ["EPSON_LQ-310", "Brother_HL"]

    args, _ = mock_run.call_args
    assert args[0] == ["lpstat", "-p"]


# ------------------------------------------------------------------ CORS


def test_cors_header_present_on_response(client):
    data = base64.b64encode(b"x").decode("ascii")
    with patch.object(app_module.subprocess, "run") as mock_run:
        mock_run.return_value = _completed(
            returncode=0, stdout=b"request id is p-1 (1 file(s))\n"
        )
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
