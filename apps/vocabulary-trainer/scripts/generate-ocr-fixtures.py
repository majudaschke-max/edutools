"""Generate small, artificial raster tables for local OCR browser QA."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "ocr"
FONT_FILE = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
FONT_BOLD_FILE = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")


def font(size: int, bold: bool = False):
    candidate = FONT_BOLD_FILE if bold else FONT_FILE
    return ImageFont.truetype(str(candidate), size) if candidate.exists() else ImageFont.load_default()


def table(filename: str, headers: list[str], rows: list[list[str]], image_format: str):
    width, height = 1400, 180 + len(rows) * 110
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    margin = 70
    column_width = (width - margin * 2) / len(headers)
    draw.rectangle((margin, 45, width - margin, height - 45), outline="#25252b", width=3)
    for index in range(1, len(headers)):
        x = round(margin + column_width * index)
        draw.line((x, 45, x, height - 45), fill="#73737d", width=2)
    draw.line((margin, 145, width - margin, 145), fill="#25252b", width=3)
    for index, header in enumerate(headers):
        draw.text((margin + 28 + column_width * index, 72), header, fill="#16161a", font=font(42, True))
    for row_index, values in enumerate(rows):
        y = 170 + row_index * 110
        if row_index:
            draw.line((margin, y - 24, width - margin, y - 24), fill="#b8b8bf", width=2)
        for column_index, value in enumerate(values):
            draw.text((margin + 28 + column_width * column_index, y), value, fill="#16161a", font=font(40))
    target = ROOT / filename
    save_options = {"quality": 94, "subsampling": 0} if image_format == "JPEG" else {"optimize": True}
    image.save(target, image_format, **save_options)


ROOT.mkdir(parents=True, exist_ok=True)
table(
    "neutral-en-de.png",
    ["Source", "Target"],
    [
        ["cloudy", "bewölkt; wolkig"],
        ["to borrow", "ausleihen"],
        ["careful", "vorsichtig"],
        ["promise", "Versprechen"],
    ],
    "PNG",
)
table(
    "neutral-fr-la.jpg",
    ["Français", "Deutsch", "Latine"],
    [
        ["bonjour", "guten Tag", "salve"],
        ["la maison", "das Haus", "domus"],
        ["l'école", "die Schule", "schola"],
        ["merci", "danke", "gratias"],
    ],
    "JPEG",
)
