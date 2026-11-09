import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const put = vi.fn().mockImplementation(async (pathname: string) => ({
  url: `https://store.private.blob.vercel-storage.com/${pathname}`,
  pathname,
}));
const list = vi.fn().mockResolvedValue({ blobs: [], hasMore: false });

vi.mock("@vercel/blob", () => ({
  put: (...a: unknown[]) => put(...a),
  list: (...a: unknown[]) => list(...a),
}));

import {
  putScanFrame,
  listScanFrames,
  putScanArtifact,
  ScanStorageError,
} from "@/lib/scan-blob";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function blob(pathname: string) {
  return {
    url: `https://store.private.blob.vercel-storage.com/${pathname}`,
    downloadUrl: `https://dl/${pathname}`,
    pathname,
    size: 10,
    uploadedAt: new Date(),
    etag: "e",
  };
}

describe("lib/scan-blob", () => {
  beforeEach(() => {
    [put, list].forEach((f) => f.mockClear());
    list.mockResolvedValue({ blobs: [], hasMore: false });
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "tok");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("putScanFrame stores at scans/{id}/{seq}.jpg as private image/jpeg", async () => {
    const res = await putScanFrame("vs-1", 7, JPEG);
    expect(res.url).toBe(
      "https://store.private.blob.vercel-storage.com/scans/vs-1/7.jpg",
    );
    const [pathname, body, opts] = put.mock.calls[0];
    expect(pathname).toBe("scans/vs-1/7.jpg");
    expect(body).toBe(JPEG);
    expect(opts).toMatchObject({
      access: "private",
      contentType: "image/jpeg",
      allowOverwrite: true,
      token: "tok",
    });
  });

  it("throws ScanStorageError(not_configured) without a token and never calls put", async () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    await expect(putScanFrame("vs-1", 0, JPEG)).rejects.toMatchObject({
      name: "ScanStorageError",
      code: "not_configured",
    });
    expect(put).not.toHaveBeenCalled();
    await expect(listScanFrames("vs-1")).rejects.toBeInstanceOf(
      ScanStorageError,
    );
  });

  it("rejects bad ids, seqs, and empty buffers before storing", async () => {
    await expect(putScanFrame("../evil", 0, JPEG)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(putScanFrame("vs/1", 0, JPEG)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(putScanFrame("vs-1", -1, JPEG)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(putScanFrame("vs-1", 5000, JPEG)).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(putScanFrame("vs-1", 0, Buffer.alloc(0))).rejects.toMatchObject(
      { code: "invalid_input" },
    );
    expect(put).not.toHaveBeenCalled();
  });

  it("wraps store failures as ScanStorageError(request_failed)", async () => {
    put.mockRejectedValueOnce(new Error("PRIVATE DETAIL"));
    await expect(putScanFrame("vs-1", 0, JPEG)).rejects.toMatchObject({
      name: "ScanStorageError",
      code: "request_failed",
    });
  });

  it("listScanFrames returns URLs ordered by seq, excluding artifacts", async () => {
    list.mockResolvedValueOnce({
      blobs: [
        blob("scans/vs-1/10.jpg"),
        blob("scans/vs-1/artifacts/preview-splat.spz"),
        blob("scans/vs-1/2.jpg"),
        blob("scans/vs-1/1.jpg"),
        blob("scans/vs-1/nope.txt"),
      ],
      hasMore: false,
    });
    const urls = await listScanFrames("vs-1");
    expect(urls).toEqual([
      "https://store.private.blob.vercel-storage.com/scans/vs-1/1.jpg",
      "https://store.private.blob.vercel-storage.com/scans/vs-1/2.jpg",
      "https://store.private.blob.vercel-storage.com/scans/vs-1/10.jpg",
    ]);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "scans/vs-1/", token: "tok" }),
    );
  });

  it("listScanFrames unrolls pagination via cursor", async () => {
    list
      .mockResolvedValueOnce({
        blobs: [blob("scans/vs-1/0.jpg")],
        hasMore: true,
        cursor: "c1",
      })
      .mockResolvedValueOnce({
        blobs: [blob("scans/vs-1/1.jpg")],
        hasMore: false,
      });
    const urls = await listScanFrames("vs-1");
    expect(urls).toHaveLength(2);
    expect(list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ cursor: "c1" }),
    );
  });

  it("putScanArtifact stores under artifacts/ with an octet-stream default", async () => {
    const data = Buffer.from("spz-bytes");
    await putScanArtifact("vs-1", "preview-splat.spz", data);
    expect(put).toHaveBeenCalledWith(
      "scans/vs-1/artifacts/preview-splat.spz",
      data,
      expect.objectContaining({
        access: "private",
        contentType: "application/octet-stream",
      }),
    );
  });

  it("putScanArtifact rejects path-traversal names", async () => {
    for (const name of ["../x", "a/b", "", ".hidden/x"]) {
      await expect(putScanArtifact("vs-1", name, JPEG)).rejects.toMatchObject({
        code: "invalid_input",
      });
    }
    expect(put).not.toHaveBeenCalled();
  });
});
