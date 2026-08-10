// lib/decodeAddress.ts
import { ZaddrModuleAny } from "./types";

let wasmModule: any = null;
let wasmInitialized = false;

export function isDecoderReady() {
  return wasmInitialized;
}

export async function initAddressDecoder() {
  if (wasmInitialized) return;
  try {
    const mod: ZaddrModuleAny =
      await import("@elemental-zcash/zaddr_wasm_parser");
    if (typeof mod.initWasm === "function") {
      await mod.initWasm();
    }
    wasmModule = mod;
    wasmInitialized = true;
    console.log("[decodeAddress] WASM decoder ready");
  } catch (err) {
    console.error("Failed to load Zcash address decoder WASM:", err);
  }
}

export type AddressReceivers = {
  /** Orchard receiver bit — product name Ironwood */
  ironwood: boolean;
  /** @deprecated use ironwood */
  orchard: boolean;
  sapling: boolean;
  transparent: boolean;
  tex: boolean;
  /** WASM getZcashAddressType string, when available */
  rawType: string | null;
  /**
   * Tooltip / summary only — not a single icon key.
   * e.g. "Ironwood + Sapling + Transparent" or "None"
   */
  type: string;
};

function summaryType(flags: {
  ironwood: boolean;
  sapling: boolean;
  transparent: boolean;
}): string {
  const parts: string[] = [];
  if (flags.ironwood) parts.push("Ironwood");
  if (flags.sapling) parts.push("Sapling");
  if (flags.transparent) parts.push("Transparent");
  return parts.length > 0 ? parts.join(" + ") : "None";
}

export function getAddressReceivers(address: string): AddressReceivers {
  const empty: AddressReceivers = {
    ironwood: false,
    orchard: false,
    sapling: false,
    transparent: false,
    tex: false,
    rawType: null,
    type: "Unknown",
  };

  if (!wasmModule || !address?.trim()) {
    return empty;
  }

  try {
    const validateFn =
      wasmModule.isZcashAddressValid ?? wasmModule.is_valid_zcash_address;
    const typeFn =
      wasmModule.getZcashAddressType ?? wasmModule.get_zcash_address_type;
    const receiversFn =
      wasmModule.getAddressReceivers ?? wasmModule.get_address_receivers;

    if (!receiversFn) {
      return empty;
    }

    const addr = address.trim();

    if (validateFn && !validateFn(addr)) {
      return { ...empty, type: "Invalid" };
    }

    const rawType = typeFn ? String(typeFn(addr)) : null;
    const result = receiversFn(addr);

    // WASM still exposes orchard; product label is Ironwood
    const ironwood = !!result.orchard;
    const sapling = !!result.sapling;
    const tex = !!result.tex;
    const transparent = !!result.p2pkh || !!result.p2sh || tex;

    return {
      ironwood,
      orchard: ironwood,
      sapling,
      transparent,
      tex,
      rawType,
      type: summaryType({ ironwood, sapling, transparent }),
    };
  } catch (err) {
    console.error("Failed to decode address:", err);
    return {
      ironwood: false,
      orchard: false,
      sapling: false,
      transparent: false,
      tex: false,
      rawType: null,
      type: "Error",
    };
  }
}