"""Builds real .pdf and .docx copies of the dummy resumes.

Written by hand rather than with a library, so the tests exercise genuine file
formats instead of text files wearing a different extension.
"""
import zipfile

BS = chr(92)  # backslash, kept out of the literals below to stay readable


def pdf(text, path):
    out = ["BT /F1 10 Tf"]
    y = 780
    for line in text.splitlines():
        safe = line.replace(BS, BS + BS).replace("(", BS + "(").replace(")", BS + ")")
        out.append("1 0 0 1 56 %d Tm (%s) Tj" % (y, safe))
        y -= 12
        if y < 40:
            break
    out.append("ET")
    stream = "\n".join(out).encode("latin-1", "replace")

    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    buf = b"%PDF-1.4\n"
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(buf))
        buf += ("%d 0 obj\n" % i).encode() + o + b"\nendobj\n"
    xref = len(buf)
    buf += ("xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)).encode()
    for off in offsets:
        buf += ("%010d 00000 n \n" % off).encode()
    buf += ("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)).encode()
    open(path, "wb").write(buf)


def docx(text, path):
    def esc(s):
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    paras = "".join(
        "<w:p><w:r><w:t xml:space='preserve'>%s</w:t></w:r></w:p>" % esc(line)
        for line in text.splitlines()
    )
    document = (
        "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
        "<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>"
        "<w:body>%s</w:body></w:document>" % paras
    )
    content_types = (
        "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
        "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>"
        "<Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/>"
        "<Default Extension='xml' ContentType='application/xml'/>"
        "<Override PartName='/word/document.xml' ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'/>"
        "</Types>"
    )
    rels = (
        "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>"
        "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>"
        "<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' Target='word/document.xml'/>"
        "</Relationships>"
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", document)


for name in ("swe", "ai"):
    text = open(name + ".txt", encoding="utf-8").read()
    pdf(text, name + ".pdf")
    docx(text, name + ".docx")

from pypdf import PdfReader

for name in ("swe", "ai"):
    pages = PdfReader(name + ".pdf").pages
    got = "".join((p.extract_text() or "") for p in pages).strip()
    first = got.splitlines()[0] if got else "EMPTY"
    print(name + ".pdf  ->", len(got), "characters readable | first line:", first)
    print(name + ".docx ->", "valid zip:", zipfile.is_zipfile(name + ".docx"))
