import {
  loadSizePreview,
  readCachedSizePreview,
  resetSizePreviewBatchForTests,
} from "./size-preview-batch";

describe("size preview batching", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    resetSizePreviewBatchForTests();
  });

  it("coalesces cards rendered together into one request and caches results", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const ids = url.searchParams.get("productIds")!.split(",");
      const body = Object.fromEntries(
        ids.map((id) => [
          id,
          { enabled: id === "a", options: [{ size: "M", qty: 2 }] },
        ]),
      );
      return { ok: true, json: async () => body };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const [a, b, a2] = await Promise.all([
      loadSizePreview("a"),
      loadSizePreview("b"),
      loadSizePreview("a"),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("productIds=a,b");
    expect(a.enabled).toBe(true);
    expect(a2).toEqual(a);
    expect(b.enabled).toBe(false);
    expect(readCachedSizePreview("a")).toEqual(a);

    await loadSizePreview("b");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves empty previews when the request fails", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    await expect(loadSizePreview("x")).resolves.toEqual({
      enabled: false,
      options: [],
    });
    expect(readCachedSizePreview("x")).toBeUndefined();
  });
});
