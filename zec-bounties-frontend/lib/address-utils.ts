/**
 * Utility functions and regex patterns for Zcash addresses.
 */

// Zcash Unified Address (UA): starts with 'u1' on mainnet, typically 100+ chars bech32m
export const UA_REGEX = /^u1[a-z0-9]{100,}$/i;

// Zcash Sapling Shielded Address: starts with 'zs1' on mainnet, typically 70+ chars bech32
export const SAPLING_REGEX = /^zs1[a-z0-9]{70,}$/i;

// Zcash Transparent Address: starts with 't1' (P2PKH) or 't3' (P2SH), typically 34-35 chars base58
export const TRANSPARENT_REGEX = /^t[13][a-km-zA-HJ-NP-Z1-9]{33,34}$/;

// Zcash Testnet Unified Address: starts with 'utest1'
export const TESTNET_UA_REGEX = /^utest1[a-z0-9]{100,}$/i;

// Zcash Testnet Sapling Address: starts with 'ztestsapling1'
export const TESTNET_SAPLING_REGEX = /^ztestsapling1[a-z0-9]{70,}$/i;

export type ZcashAddressKind =
  | "unified"
  | "sapling"
  | "transparent"
  | "testnet"
  | "invalid";

/**
 * Returns true if the address matches a Zcash Unified Address format (u1...).
 */
export function isUnifiedAddress(address: string): boolean {
  return UA_REGEX.test(address.trim());
}

/**
 * Returns true if the address matches a Zcash Sapling Shielded address format (zs1...).
 */
export function isSaplingAddress(address: string): boolean {
  return SAPLING_REGEX.test(address.trim());
}

/**
 * Returns true if the address matches a Zcash shielded address (Unified Address or Sapling).
 */
export function isShieldedAddress(address: string): boolean {
  const trimmed = address.trim();
  return UA_REGEX.test(trimmed) || SAPLING_REGEX.test(trimmed);
}

/**
 * Returns true if the address matches a Zcash transparent address (t1... or t3...).
 */
export function isTransparentAddress(address: string): boolean {
  return TRANSPARENT_REGEX.test(address.trim());
}

/**
 * Determines the category of a given Zcash address string.
 */
export function getZcashAddressKind(address: string): ZcashAddressKind {
  const trimmed = address.trim();
  if (UA_REGEX.test(trimmed)) return "unified";
  if (SAPLING_REGEX.test(trimmed)) return "sapling";
  if (TRANSPARENT_REGEX.test(trimmed)) return "transparent";
  if (TESTNET_UA_REGEX.test(trimmed) || TESTNET_SAPLING_REGEX.test(trimmed) || trimmed.startsWith("utest")) {
    return "testnet";
  }
  return "invalid";
}

export const TRANSPARENT_ADDRESS_WARNING =
  "Notice: ZEC Bounties uses shielded payouts. Please provide a Unified Address (UA) from Zashi, YWallet, or Zingo for shielded transactions.";

export const WALLET_GUIDE_URL = "https://zechub.wiki/using-zcash/wallets";
