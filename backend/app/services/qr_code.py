"""QR code generation service for sample labels."""

import io
import zipfile

import qrcode
from PIL import Image, ImageDraw, ImageFont
from qrcode.constants import ERROR_CORRECT_M


def generate_sample_qr(sample_code: str) -> bytes:
    """Generate a QR code PNG for a sample code with a text label below."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(sample_code)
    qr.make(fit=True)

    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")

    # Add text label below
    qr_w, qr_h = qr_img.size
    label_height = 30
    combined = Image.new("RGB", (qr_w, qr_h + label_height), "white")
    combined.paste(qr_img, (0, 0))

    draw = ImageDraw.Draw(combined)
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except OSError:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
        except OSError:
            font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), sample_code, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = (qr_w - text_w) // 2
    text_y = qr_h + (label_height - (bbox[3] - bbox[1])) // 2
    draw.text((text_x, text_y), sample_code, fill="black", font=font)

    buf = io.BytesIO()
    combined.save(buf, format="PNG")
    return buf.getvalue()


def generate_batch_qr(sample_codes: list[str]) -> io.BytesIO:
    """Generate a ZIP file containing QR code PNGs for multiple sample codes."""
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for code in sample_codes:
            png_bytes = generate_sample_qr(code)
            zf.writestr(f"{code}.png", png_bytes)
    zip_buf.seek(0)
    return zip_buf
