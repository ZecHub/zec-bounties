import type { Balance } from "@/lib/types";

export const confirmedTotal = (b: Balance | undefined | null) =>
  ((b?.confirmed_ironwood_balance ?? 0) +
    (b?.confirmed_orchard_balance ?? 0) +
    (b?.confirmed_sapling_balance ?? 0) +
    (b?.confirmed_transparent_balance ?? 0)) /
  1e8;

export const fmt = (n: number) => n.toFixed(4);
