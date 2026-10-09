"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadSizePreview,
  readCachedSizePreview,
  type SizePreviewConfig,
  type SizePreviewOption,
} from "@/features/products/size-preview-batch";

function formatSizeLabel(option: SizePreviewOption) {
  const size = String(option.size ?? "")
    .trim()
    .toUpperCase();
  const qty = Number(option.qty ?? 0);
  if (!size) return `${qty}`;
  if (/^[A-Z]+$/.test(size)) return `${size} : ${qty}`;
  return size;
}

export default function ProductSizePreview({
  productId,
}: {
  productId: string;
}) {
  const [data, setData] = useState<SizePreviewConfig | null>(
    () => readCachedSizePreview(productId) ?? null,
  );

  useEffect(() => {
    let mounted = true;
    void loadSizePreview(productId).then((config) => {
      if (mounted) setData(config);
    });
    return () => {
      mounted = false;
    };
  }, [productId]);

  const labels = useMemo(() => {
    if (!data?.enabled) return [];
    return (data.options ?? [])
      .filter((option) => Number(option.qty ?? 0) > 0)
      .map(formatSizeLabel);
  }, [data]);

  if (labels.length === 0) return null;

  return (
    <p className="text-xs text-muted-foreground line-clamp-2">
      Sizes: {labels.join(", ")}
    </p>
  );
}
