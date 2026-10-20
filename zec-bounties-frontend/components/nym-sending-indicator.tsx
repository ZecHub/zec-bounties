"use client";

import { useEffect, useState } from "react";

const EVENT = "nym-sending";

export function setNymSending(open: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: open }));
}

export function NymSendingBanner() {
  const [open, setOpen] = useState(false);
  const [slow, setSlow] = useState(false);
  const [showZec, setShowZec] = useState(false);

  useEffect(() => {
    const onEvent = (e: Event) => {
      setOpen(Boolean((e as CustomEvent).detail));
    };
    window.addEventListener(EVENT, onEvent);
    return () => window.removeEventListener(EVENT, onEvent);
  }, []);

  useEffect(() => {
    if (!open) {
      setSlow(false);
      setShowZec(false);
      return;
    }
    const slowT = setTimeout(() => setSlow(true), 15_000);
    const flip = setInterval(() => setShowZec((v) => !v), 1100);
    return () => {
      clearTimeout(slowT);
      clearInterval(flip);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        background: "#111",
        color: "#f5f5f5",
        border: "1px solid #333",
        borderRadius: 8,
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <span
        style={{
          position: "relative",
          width: 22,
          height: 22,
          background: "#000",
          borderRadius: 5,
          flexShrink: 0,
        }}
      >
        <img
          src="/nym.svg"
          alt=""
          width={14}
          height={14}
          style={{
            position: "absolute",
            inset: 4,
            width: 14,
            height: 14,
            opacity: showZec ? 0 : 1,
            transition: "opacity 0.4s ease",
          }}
        />
        <img
          src="/zcash.svg"
          alt=""
          width={18}
          height={18}
          style={{
            position: "absolute",
            inset: 2,
            width: 18,
            height: 18,
            opacity: showZec ? 1 : 0,
            transition: "opacity 0.4s ease",
          }}
        />
      </span>
      <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
        {slow ? "Still sending via Nym…" : "Sending via Nym…"}
      </span>
      <span
        style={{
          width: 120,
          height: 4,
          background: "#333",
          borderRadius: 999,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <span
          className="nym-bar"
          style={{
            display: "block",
            height: "100%",
            width: "40%",
            background: "#f4b728",
          }}
        />
      </span>
      {slow && (
        <span style={{ fontSize: 12, color: "#aaa", whiteSpace: "nowrap" }}>
          Nym bootstrap can take a minute
        </span>
      )}
    </div>
  );
}
