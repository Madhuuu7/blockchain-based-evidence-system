import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sniffFileType } from "../../src/utils/sniffFileType.js";

const bytes = (...values) => Buffer.from(values);
const pad = (buffer, to = 64) => Buffer.concat([buffer, Buffer.alloc(to, 0x41)]);

describe("sniffFileType", () => {
  it("recognises the image formats an exhibit photo arrives in", () => {
    assert.equal(sniffFileType(pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).mime, "image/png");
    assert.equal(sniffFileType(pad(bytes(0xff, 0xd8, 0xff, 0xe0))).mime, "image/jpeg");
    assert.equal(sniffFileType(pad(Buffer.from("GIF89a"))).mime, "image/gif");
    assert.equal(
      sniffFileType(Buffer.concat([Buffer.from("RIFF"), bytes(1, 2, 3, 4), Buffer.from("WEBPVP8 ")])).mime,
      "image/webp"
    );
  });

  it("recognises PDF, MP4 and plain text", () => {
    assert.deepEqual(sniffFileType(Buffer.from("%PDF-1.7\n...")), { mime: "application/pdf", ext: "pdf" });
    assert.equal(
      sniffFileType(Buffer.concat([bytes(0, 0, 0, 0x20), Buffer.from("ftypisom"), Buffer.alloc(16)])).mime,
      "video/mp4"
    );
    assert.deepEqual(sniffFileType(Buffer.from("Chat log export, seized 2026-02-11.\n")), {
      mime: "text/plain; charset=utf-8",
      ext: "txt"
    });
  });

  it("treats non-ASCII UTF-8 text as text", () => {
    assert.equal(sniffFileType(Buffer.from("ಸಾಕ್ಷ್ಯ - payment of ₹5,000\n")).ext, "txt");
  });

  it("falls back to a download for anything it does not recognise", () => {
    const fallback = { mime: "application/octet-stream", ext: "bin" };
    assert.deepEqual(sniffFileType(bytes(0x00, 0x01, 0x02, 0xfe, 0xff, 0x00, 0x10)), fallback);
    assert.deepEqual(sniffFileType(Buffer.alloc(0)), fallback);
    assert.deepEqual(sniffFileType(undefined), fallback);
  });

  it("never names a type that could run script in the page", () => {
    // Both are valid text, and must be served as inert text - not as HTML/SVG.
    const html = sniffFileType(Buffer.from("<!doctype html><script>alert(1)</script>"));
    const svg = sniffFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'));
    assert.equal(html.mime, "text/plain; charset=utf-8");
    assert.equal(svg.mime, "text/plain; charset=utf-8");
  });

  it("goes by the bytes, not by a signature that is too short to be real", () => {
    assert.equal(sniffFileType(bytes(0x89, 0x50)).mime, "application/octet-stream");
  });
});
