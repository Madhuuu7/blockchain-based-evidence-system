/**
 * Works out what a file is from its own leading bytes.
 *
 * The "fileType" recorded with an exhibit is a label an officer typed -
 * "screenshot", "disk-image" - not a media type, and nothing else about the
 * original file is stored on-chain. So the only trustworthy way to tell a
 * browser how to display an exhibit is to look at the bytes themselves, which
 * also works for every exhibit registered before this existed.
 *
 * Only formats a browser can display safely are named. Anything else, or
 * anything unrecognised, is "application/octet-stream" and gets downloaded
 * rather than rendered. HTML and SVG are deliberately not recognised: an
 * exhibit is untrusted content and must never run script in this origin.
 */

const SIGNATURES = [
  { mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", ext: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/bmp", ext: "bmp", bytes: [0x42, 0x4d] },
  { mime: "application/pdf", ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { mime: "application/zip", ext: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] }
];

const FALLBACK = { mime: "application/octet-stream", ext: "bin" };

function startsWith(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, i) => buffer[offset + i] === byte);
}

function ascii(buffer, start, end) {
  return buffer.subarray(start, end).toString("latin1");
}

/** True when the sample decodes as UTF-8 text with no control characters. */
function looksLikeText(buffer) {
  const sample = buffer.subarray(0, 4096);
  if (sample.length === 0) return false;

  for (const byte of sample) {
    const isControl = byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d;
    if (isControl || byte === 0x7f) return false;
  }

  // Invalid UTF-8 means it is not text. The one exception is a multi-byte
  // character cut in half by the sample boundary, which can only happen when
  // the file is longer than the sample and only at its very end.
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(sample);
  const firstBad = decoded.indexOf("�");
  if (firstBad === -1) return true;

  const truncated = buffer.length > sample.length;
  return truncated && firstBad === decoded.length - 1;
}

/**
 * @param {Buffer} buffer the file's bytes
 * @returns {{ mime: string, ext: string }}
 */
export function sniffFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return FALLBACK;

  for (const { mime, ext, bytes } of SIGNATURES) {
    if (startsWith(buffer, bytes)) return { mime, ext };
  }

  // RIFF containers: the format name sits at offset 8.
  if (ascii(buffer, 0, 4) === "RIFF") {
    const kind = ascii(buffer, 8, 12);
    if (kind === "WEBP") return { mime: "image/webp", ext: "webp" };
    if (kind === "WAVE") return { mime: "audio/wav", ext: "wav" };
  }

  // ISO base media (MP4 and relatives): "ftyp" at offset 4.
  if (ascii(buffer, 4, 8) === "ftyp") return { mime: "video/mp4", ext: "mp4" };

  if (startsWith(buffer, [0x49, 0x44, 0x33]) || startsWith(buffer, [0xff, 0xfb])) {
    return { mime: "audio/mpeg", ext: "mp3" };
  }

  if (looksLikeText(buffer)) return { mime: "text/plain; charset=utf-8", ext: "txt" };

  return FALLBACK;
}
