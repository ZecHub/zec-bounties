import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Balance } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatStatus(status: string) {
  if (!status) return "";

  return status
    .trim()
    .toLowerCase() // "to_do"
    .replace(/_+/g, " ") // "to do"
    .replace(/\b\w/g, (c) => c.toUpperCase()); // "To Do"
}

export function formatAddress(str: string, keep = 36) {
  if (!str) return "";
  if (!Number.isFinite(keep) || keep <= 0 || str.length <= keep * 2) return str;

  return str.slice(0, keep) + "...." + str.slice(-keep);
}

// Date <input> helpers work in local time — toISOString() converts to UTC
// first, which shifts the calendar day for viewers whose offset crosses it.

export function toDateInputValue(date: Date | null | undefined): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";

  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseDateInputValue(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) return new Date(NaN);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return new Date(NaN);

  const date = new Date(year, month - 1, day);
  date.setFullYear(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return new Date(NaN);
  }

  return date;
}

export const confirmedTotal = (b: Balance | undefined) => {
  return (
    ((b?.confirmed_ironwood_balance ?? 0) +
      (b?.confirmed_orchard_balance ?? 0) +
      (b?.confirmed_sapling_balance ?? 0) +
      (b?.confirmed_transparent_balance ?? 0)) /
    1e8
  );
};

export const fmt = (n: number) => n.toFixed(4);
