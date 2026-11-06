"use client";

import { useState, useEffect } from "react";

// NOTE: 0.5 * 60 * 1000 is 30s. Confirm that's the intended cooldown.
const RESCAN_HIDE_MS = 0.5 * 60 * 1000;

export function useRescanCooldown(storageKey = "walletImportedAt") {
  const read = () => {
    try {
      const ts = localStorage.getItem(storageKey);
      return !!ts && Date.now() - Number(ts) < RESCAN_HIDE_MS;
    } catch {
      return false;
    }
  };
  const [hidden, setHidden] = useState(read);
  useEffect(() => {
    setHidden(read());
    try {
      const ts = localStorage.getItem(storageKey);
      if (!ts) return;
      const remaining = RESCAN_HIDE_MS - (Date.now() - Number(ts));
      if (remaining <= 0) return;
      const t = setTimeout(() => setHidden(false), remaining);
      return () => clearTimeout(t);
    } catch {}
  }, [storageKey]);
  return hidden;
}
