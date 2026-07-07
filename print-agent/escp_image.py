"""PNG/點陣圖 → ESC/P2 24-pin bit-image 位元組。

LQ-310 是 24 針 ESC/P2 印表機。圖形列印方式:
- ESC @              重置
- ESC 3 24           行距 = 24/180 吋(每條 raster band 高 24 點,無縫接合)
- 每 24 列一條 band:
    ESC * 39 nL nH   39 = 180 dpi 水平密度,24 點;nL/nH = 該 band 欄數(寬)
    每欄 3 bytes(24 bits,bit7 = 最上點)
    CR LF            回左邊界並下移一條 band
- FF                 送紙 / 跳頁

黑點 = 影像該像素為深色(mode '1' 時 0 = 黑)。
"""

from PIL import Image, ImageOps

# 24-pin 180 dpi 水平密度模式(ESC * 39)。180×180 方形點,最適合圖文。
_ESC = 0x1B
_BAND = 24  # 一條 band 的點列數(24 針)


def render_png_to_escp(png_bytes: bytes, width_dots: int = 1400, threshold: int = 160) -> bytes:
    """把 PNG bytes 轉成 ESC/P bit-image。

    width_dots: 目標列印寬度(點)。1400 ≈ 7.8 吋 @180dpi,適合 LQ-310 窄車。
    threshold: 二值化門檻(0-255),越大越容易變黑。
    """
    img = Image.open(_bytes_io(png_bytes))
    # 去 alpha:貼到白底,避免透明區變黑
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        img = Image.alpha_composite(bg, img)
    img = img.convert("L")  # 灰階

    # 依目標寬度等比縮放
    if img.width != width_dots:
        h = max(1, round(img.height * width_dots / img.width))
        img = img.resize((width_dots, h), Image.LANCZOS)

    # 二值化(門檻),得 mode '1':0 = 黑,255 = 白
    img = img.point(lambda p: 255 if p >= threshold else 0, mode="L").convert("1")

    return _image1_to_escp(img)


def _image1_to_escp(img: "Image.Image") -> bytes:
    w, h = img.size
    px = img.load()
    out = bytearray()
    out += bytes([_ESC, 0x40])            # ESC @  初始化
    out += bytes([_ESC, 0x33, _BAND])     # ESC 3 24  行距 24/180"
    nL, nH = w & 0xFF, (w >> 8) & 0xFF

    for top in range(0, h, _BAND):
        out += bytes([_ESC, 0x2A, 39, nL, nH])  # ESC * 39 nL nH
        for x in range(w):
            b1 = b2 = b3 = 0
            for bit in range(8):
                y = top + bit
                if y < h and px[x, y] == 0:
                    b1 |= 1 << (7 - bit)
            for bit in range(8):
                y = top + 8 + bit
                if y < h and px[x, y] == 0:
                    b2 |= 1 << (7 - bit)
            for bit in range(8):
                y = top + 16 + bit
                if y < h and px[x, y] == 0:
                    b3 |= 1 << (7 - bit)
            out += bytes([b1, b2, b3])
        out += b"\r\n"  # CR + LF → 回左邊界並下移一條 band

    out += b"\x0c"  # FF
    return bytes(out)


def _bytes_io(b: bytes):
    import io

    return io.BytesIO(b)
