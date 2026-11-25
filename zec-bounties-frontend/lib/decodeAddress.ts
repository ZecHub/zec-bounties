// lib/decodeAddress.ts
import { ZaddrModuleAny } from "./types";

let wasmModule: ZaddrModuleAny | null = null;
let wasmInitialized = false;
let initPromise: Promise<void> | null = null;

export function isDecoderReady() {
  return wasmInitialized && wasmModule !== null;
}

export async function initAddressDecoder() {
  if (wasmInitialized && wasmModule !== null) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
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
      wasmModule = null;
      wasmInitialized = false;
      console.error("Failed to load Zcash address decoder WASM:", err);
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
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

  if (!wasmModule || typeof address !== "string") {
    return empty;
  }

  const addr = address.trim();
  if (!addr) {
    return empty;
  }

  try {
    const validateFn =
      wasmModule.isZcashAddressValid ?? wasmModule.is_valid_zcash_address;
    const typeFn =
      wasmModule.getZcashAddressType ?? wasmModule.get_zcash_address_type;
    const receiversFn =
      wasmModule.getAddressReceivers ?? wasmModule.get_address_receivers;

    if (typeof receiversFn !== "function") {
      return empty;
    }

    if (typeof validateFn === "function" && !validateFn(addr)) {
      return { ...empty, type: "Invalid" };
    }

    const rawTypeValue = typeof typeFn === "function" ? typeFn(addr) : null;
    const rawType = rawTypeValue != null ? String(rawTypeValue) : null;
    const result = receiversFn(addr);
    if (!result || typeof result !== "object") {
      return { ...empty, rawType, type: "Invalid" };
    }

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
