import { describe, it, expect } from "vitest";
import { previewKind } from "../pages/EvidenceDetail.jsx";

// Decides how an exhibit is shown on the evidence page, from the media type
// the server read out of the file's bytes.
describe("previewKind", () => {
  it("shows photographs and documents in the page", () => {
    expect(previewKind("image/jpeg")).toBe("image");
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("video/mp4")).toBe("video");
    expect(previewKind("audio/mpeg")).toBe("audio");
  });

  it("ignores the charset parameter on text", () => {
    expect(previewKind("text/plain; charset=utf-8")).toBe("text");
  });

  it("never renders markup, an unknown format, or a missing type", () => {
    expect(previewKind("text/html")).toBe("none");
    expect(previewKind("application/octet-stream")).toBe("none");
    expect(previewKind("screenshot")).toBe("none");
    expect(previewKind("")).toBe("none");
    expect(previewKind(undefined)).toBe("none");
  });
});
