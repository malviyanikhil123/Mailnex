/**
 * Helpers for user-uploaded files: a safe display name and a content check that the
 * bytes really are the type the extension claims (browsers report MIME types too
 * inconsistently to rely on, e.g. CSV arrives as application/vnd.ms-excel on Windows).
 */

const MAX_STEM_CHARS = 120;

// Control characters, characters Windows and mail headers reject, and bidi overrides
// that can disguise an extension ("invoice‮fdp.exe" displays as "invoiceexe.pdf").
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f<>:"/\\|?*‎‏‪-‮⁦-⁩]/g;

/** The original file name reduced to a safe base name ("../../a<b>.pdf" → "ab.pdf"). */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base.normalize("NFC").replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  const dot = cleaned.lastIndexOf(".");
  const ext = dot >= 0 ? cleaned.slice(dot + 1) : "";
  const stem = (dot >= 0 ? cleaned.slice(0, dot) : cleaned).replace(/^[. ]+/, "").slice(0, MAX_STEM_CHARS).trim();
  return ext ? `${stem || "document"}.${ext}` : stem;
}

/** Lower-case extension without the dot, or "" when there is none. */
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // legacy .doc/.xls/.ppt
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // .docx/.xlsx/.pptx are zip packages
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

function startsWith(buf: Buffer, bytes: number[]): boolean {
  return buf.length >= bytes.length && bytes.every((b, i) => buf[i] === b);
}

/** Office Open XML: a zip whose entries live under the app folder, e.g. "word/". */
function isOfficeZip(buf: Buffer, folder: string): boolean {
  return startsWith(buf, ZIP) && buf.includes(folder);
}

/** Plain text: no NUL bytes in the first 8 KB, unless it starts with a UTF-16 byte-order mark. */
function looksLikeText(buf: Buffer): boolean {
  if (startsWith(buf, [0xff, 0xfe]) || startsWith(buf, [0xfe, 0xff])) return true;
  return !buf.subarray(0, 8192).includes(0);
}

/** True when the file content matches what its extension says it is. */
export function matchesFileSignature(ext: string, buf: Buffer): boolean {
  switch (ext) {
    case "pdf":
      return buf.subarray(0, 1024).includes("%PDF-");
    case "doc":
      return startsWith(buf, OLE2) || buf.subarray(0, 5).toString("latin1") === "{\\rtf";
    case "xls":
    case "ppt":
      return startsWith(buf, OLE2);
    case "docx":
      return isOfficeZip(buf, "word/");
    case "xlsx":
      return isOfficeZip(buf, "xl/");
    case "pptx":
      return isOfficeZip(buf, "ppt/");
    case "png":
      return startsWith(buf, PNG);
    case "jpg":
    case "jpeg":
      return startsWith(buf, JPEG);
    case "csv":
    case "txt":
      return looksLikeText(buf);
    default:
      return false;
  }
}
