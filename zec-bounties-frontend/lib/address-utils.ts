/**
 * Utility functions and regex patterns for Zcash addresses.
 */

// Bech32/Bech32m data alphabet excludes '1', 'b', 'i', and 'o' (BIP-173 / BIP-350 / ZIP-316)
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

// Zcash Unified Address (UA): starts with 'u1' on mainnet, typically 100+ chars bech32m
export const UA_REGEX = new RegExp(`^u1[${BECH32_CHARSET}]{100,}$`, "i");

// Zcash Sapling Shielded Address: starts with 'zs1' on mainnet, typically 70+ chars bech32
export const SAPLING_REGEX = new RegExp(`^zs1[${BECH32_CHARSET}]{70,}$`, "i");

// Zcash Transparent Address: starts with 't1' (P2PKH) or 't3' (P2SH), typically 34-35 chars base58
export const TRANSPARENT_REGEX = /^t[13][a-km-zA-HJ-NP-Z1-9]{33,34}$/;

// Zcash Testnet Unified Address: starts with 'utest1'
export const TESTNET_UA_REGEX = new RegExp(
  `^utest1[${BECH32_CHARSET}]{100,}$`,
  "i",
);

// Zcash Testnet Sapling Address: starts with 'ztestsapling1'
export const TESTNET_SAPLING_REGEX = new RegExp(
  `^ztestsapling1[${BECH32_CHARSET}]{70,}$`,
  "i",
);

// Zcash Testnet Transparent Address: starts with 'tm' (P2PKH) or 't2' (P2SH)
export const TESTNET_TRANSPARENT_REGEX = /^t[m2][a-km-zA-HJ-NP-Z1-9]{33,34}$/;

export type ZcashAddressKind =
  | "unified"
  | "sapling"
  | "transparent"
  | "testnet"
  | "invalid";

function normalizeAddress(address: unknown): string {
  return typeof address === "string" ? address.trim() : "";
}

// Bech32 / Bech32m strings must be all-lowercase or all-uppercase (never mixed case)
function isSingleCase(value: string): boolean {
  return value === value.toLowerCase() || value === value.toUpperCase();
}

function matchesBech32(value: string, pattern: RegExp): boolean {
  return Boolean(value) && isSingleCase(value) && pattern.test(value);
}

/**
 * Returns true if the address matches a Zcash Unified Address format (u1...).
 */
export function isUnifiedAddress(address: string): boolean {
  return matchesBech32(normalizeAddress(address), UA_REGEX);
}

/**
 * Returns true if the address matches a Zcash Sapling Shielded address format (zs1...).
 */
export function isSaplingAddress(address: string): boolean {
  return matchesBech32(normalizeAddress(address), SAPLING_REGEX);
}

/**
 * Returns true if the address matches a Zcash shielded address (Unified Address or Sapling).
 */
export function isShieldedAddress(address: string): boolean {
  const trimmed = normalizeAddress(address);
  return (
    matchesBech32(trimmed, UA_REGEX) || matchesBech32(trimmed, SAPLING_REGEX)
  );
}

/**
 * Returns true if the address matches a Zcash transparent address (t1... or t3...).
 */
export function isTransparentAddress(address: string): boolean {
  const trimmed = normalizeAddress(address);
  return Boolean(trimmed) && TRANSPARENT_REGEX.test(trimmed);
}

/**
 * Determines the category of a given Zcash address string.
 */
export function getZcashAddressKind(address: string): ZcashAddressKind {
  const trimmed = normalizeAddress(address);
  if (!trimmed) return "invalid";
  if (matchesBech32(trimmed, UA_REGEX)) return "unified";
  if (matchesBech32(trimmed, SAPLING_REGEX)) return "sapling";
  if (TRANSPARENT_REGEX.test(trimmed)) return "transparent";
  if (
    matchesBech32(trimmed, TESTNET_UA_REGEX) ||
    matchesBech32(trimmed, TESTNET_SAPLING_REGEX) ||
    TESTNET_TRANSPARENT_REGEX.test(trimmed)
  ) {
    return "testnet";
  }
  return "invalid";
}

export const TRANSPARENT_ADDRESS_WARNING =
  "Notice: ZEC Bounties uses shielded payouts. Please provide a Unified Address (UA) from Zashi, YWallet, or Zingo for shielded transactions.";

export const WALLET_GUIDE_URL = "https://zechub.wiki/using-zcash/wallets";
