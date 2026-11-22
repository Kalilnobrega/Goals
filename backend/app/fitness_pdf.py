PAGE_WIDTH = 595.28
PAGE_HEIGHT = 841.89
MARGIN = 48
CHAR_WIDTH = 0.5

STYLES = {
    "title": {"font": "F2", "size": 20, "color": (0.07, 0.08, 0.09), "before": 0, "after": 4},
    "subtitle": {"font": "F1", "size": 10, "color": (0.42, 0.45, 0.49), "before": 0, "after": 14},
    "section": {"font": "F2", "size": 14, "color": (0.30, 0.49, 0.06), "before": 14, "after": 6},
    "heading": {"font": "F2", "size": 12, "color": (0.07, 0.08, 0.09), "before": 12, "after": 2},
    "meta": {"font": "F1", "size": 9, "color": (0.42, 0.45, 0.49), "before": 0, "after": 6},
    "exercise": {"font": "F2", "size": 10, "color": (0.15, 0.17, 0.19), "before": 6, "after": 2},
    "text": {"font": "F1", "size": 10, "color": (0.15, 0.17, 0.19), "before": 0, "after": 1},
    "note": {"font": "F1", "size": 9, "color": (0.42, 0.45, 0.49), "before": 0, "after": 2},
}


def escape(text: str) -> str:
    raw = text.encode("cp1252", errors="replace").decode("latin-1")
    return raw.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def wrap(text: str, size: float, width: float, indent: float) -> list[str]:
    limit = max(10, int((width - indent) / (size * CHAR_WIDTH)))
    lines, current = [], ""
    for word in text.split(" "):
        candidate = f"{current} {word}" if current else word
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            lines.append(current)
        while len(word) > limit:
            lines.append(word[:limit])
            word = word[limit:]
        current = word
    lines.append(current)
    return lines


class PdfDocument:
    def __init__(self):
        self.pages: list[list[str]] = []
        self.y = 0.0
        self.new_page()

    def new_page(self):
        self.pages.append([])
        self.y = PAGE_HEIGHT - MARGIN

    def add(self, style: str, text: str, indent: float = 0):
        spec = STYLES[style]
        size = spec["size"]
        leading = size * 1.35
        lines = wrap(text, size, PAGE_WIDTH - 2 * MARGIN, indent)
        self.y -= spec["before"]
        if self.y - leading * min(len(lines), 2) < MARGIN:
            self.new_page()
        r, g, b = spec["color"]
        for line in lines:
            if self.y - leading < MARGIN:
                self.new_page()
            self.y -= leading
            self.pages[-1].append(
                f"BT /{spec['font']} {size} Tf {r:.2f} {g:.2f} {b:.2f} rg {MARGIN + indent:.2f} {self.y:.2f} Td ({escape(line)}) Tj ET"
            )
        self.y -= spec["after"]

    def rule(self):
        self.y -= 6
        if self.y < MARGIN + 20:
            self.new_page()
            return
        self.pages[-1].append(f"0.85 0.87 0.89 RG 0.6 w {MARGIN} {self.y:.2f} m {PAGE_WIDTH - MARGIN} {self.y:.2f} l S")
        self.y -= 4

    def build(self) -> bytes:
        objects: list[bytes] = []
        page_count = len(self.pages)
        first_page = 5
        objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
        kids = " ".join(f"{first_page + index * 2} 0 R" for index in range(page_count))
        objects.append(f"<< /Type /Pages /Kids [{kids}] /Count {page_count} >>".encode())
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        for index, commands in enumerate(self.pages):
            footer = f"BT /F1 8 Tf 0.55 0.58 0.62 rg {MARGIN} 24 Td ({escape(f'GymGoals · página {index + 1} de {page_count}')}) Tj ET"
            stream = "\n".join([*commands, footer]).encode("latin-1")
            content_id = first_page + index * 2 + 1
            objects.append(
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}] "
                f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_id} 0 R >>".encode()
            )
            objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
        output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = []
        for number, body in enumerate(objects, start=1):
            offsets.append(len(output))
            output += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
        xref = len(output)
        output += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
        for offset in offsets:
            output += f"{offset:010d} 00000 n \n".encode()
        output += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
        return bytes(output)
