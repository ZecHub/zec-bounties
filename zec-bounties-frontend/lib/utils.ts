import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Balance } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatStatus(status: string) {
  return status
    .toLowerCase() // "to_do"
    .replace(/_/g, " ") // "to do"
    .replace(/\b\w/g, (c) => c.toUpperCase()); // "To Do"
}

export function formatAddress(str: string, keep = 36) {
  if (str.length <= keep * 2) return str;

  return str.slice(0, keep) + "...." + str.slice(-keep);
}

export const confirmedTotal = (b: Balance) =>
  ((b.confirmed_ironwood_balance ?? b.confirmed_orchard_balance ?? 0) +
    (b.confirmed_sapling_balance ?? 0) +
    (b.confirmed_transparent_balance ?? 0)) /
  1e8;

export const fmt = (n: number) => n.toFixed(4);
