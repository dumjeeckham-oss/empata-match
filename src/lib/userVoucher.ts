import type { ServiceUser } from "@/types";

export type VoucherTierSource = Pick<ServiceUser, "voucherTier" | "voucherTierLabel">;

export function formatVoucherTier(source: VoucherTierSource, fallback = "미등록"): string {
  const custom = String(source.voucherTierLabel || "").trim();
  if (custom) return custom;
  const tier = Number(source.voucherTier);
  return tier > 0 ? `${tier}구간` : fallback;
}
