jest.mock("server-only", () => ({}));

jest.mock("../cache/redis", () => ({
  redisGet: jest.fn(async () => null),
  redisGetChecked: jest.fn(async () => ({ ok: true, value: null })),
  redisSet: jest.fn(async () => undefined),
  redisDel: jest.fn(async () => undefined),
  redisDelByPrefix: jest.fn(async () => undefined),
}));

jest.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

jest.mock("../supabase/db", () => ({
  __esModule: true,
  default: {
    select: jest.fn(),
  },
}));

import db from "../supabase/db";
import { clearStorefrontMemoryCache } from "../cache/storefront-cache";
import {
  buildSnapshotPricing,
  getProductStorefrontSnapshot,
} from "./product-storefront-snapshot";

const mockDb = db as unknown as {
  select: jest.Mock;
};

function mockSelectRows(rows: unknown[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

describe("buildSnapshotPricing", () => {
  it("applies an active discount", () => {
    const pricing = buildSnapshotPricing({
      id: "prod-1",
      price: "1000.00",
      discountEnabled: true,
      discountPercent: 10,
    });
    expect(pricing).toMatchObject({
      productId: "prod-1",
      listPrice: 1000,
      unitPrice: 900,
      discountActive: true,
      discountPercent: 10,
    });
  });

  it("returns null when the product row is missing", () => {
    expect(buildSnapshotPricing(undefined)).toBeNull();
  });
});

describe("getProductStorefrontSnapshot", () => {
  beforeEach(() => {
    clearStorefrontMemoryCache();
    jest.clearAllMocks();
  });

  it("skips the database for a blank id", async () => {
    expect(await getProductStorefrontSnapshot("  ")).toBeNull();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("serves repeat reads from cache", async () => {
    mockSelectRows([
      {
        id: "p1",
        price: "500.00",
        discountEnabled: false,
        discountPercent: null,
      },
    ]);

    const first = await getProductStorefrontSnapshot("p1");
    const second = await getProductStorefrontSnapshot("p1");

    expect(first?.unitPrice).toBe(500);
    expect(second?.unitPrice).toBe(500);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});
