"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Ban, Leaf, TreeDeciduous } from "lucide-react";
import { cn } from "@/lib/utils";

export type UaReceiverKey = "none" | "transparent" | "sapling" | "ironwood";

export type UaReceivers = {
  ironwood?: boolean;
  sapling?: boolean;
  transparent?: boolean;
};

export const UA_FILTERS: { key: UaReceiverKey; label: string }[] = [
  { key: "none", label: "None" },
  { key: "transparent", label: "Transparent" },
  { key: "sapling", label: "Sapling" },
  { key: "ironwood", label: "Ironwood" },
];

export function UaFilterIcon({
  kind,
  className,
}: {
  kind: UaReceiverKey;
  className?: string;
}) {
  if (kind === "none") {
    return <Ban className={cn("w-3.5 h-3.5 text-red-500", className)} />;
  }
  if (kind === "transparent") {
    return (
      <AlertTriangle className={cn("w-3.5 h-3.5 text-yellow-400", className)} />
    );
  }
  if (kind === "sapling") {
    return <Leaf className={cn("w-3.5 h-3.5 text-emerald-400", className)} />;
  }
  return (
    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-zinc-700 border border-zinc-300">
      <TreeDeciduous className="w-2.5 h-2.5 text-zinc-200" />
    </span>
  );
}

export function UaReceiverIcons({
  receivers,
  size = "sm",
}: {
  receivers?: UaReceivers;
  size?: "sm" | "md";
}) {
  const r = receivers ?? {};
  const empty = !r.ironwood && !r.sapling && !r.transparent;

  const box = size === "md" ? "w-7 h-7" : "w-5 h-5";
  const glyph = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";

  const slot = (title: string, on: boolean, icon: ReactNode) => (
    <div
      title={on ? title : `${title} (absent)`}
      className={cn(
        "flex items-center justify-center shrink-0",
        box,
        !on && "opacity-20",
      )}
    >
      {icon}
    </div>
  );

  if (empty) {
    return (
      <div title="No Address" className="grid grid-cols-3 gap-1.5 w-fit">
        <div className={box} />
        <div
          className={cn("flex items-center justify-center text-red-500", box)}
        >
          <Ban className={glyph} />
        </div>
        <div className={box} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5 w-fit">
      {slot(
        "Transparent",
        !!r.transparent,
        <AlertTriangle className={cn(glyph, "text-yellow-400")} />,
      )}
      {slot(
        "Sapling",
        !!r.sapling,
        <Leaf className={cn(glyph, "text-emerald-400")} />,
      )}
      {slot(
        "Ironwood",
        !!r.ironwood,
        <span
          className={cn(
            "flex items-center justify-center w-full h-full rounded-full",
            r.ironwood && "bg-zinc-700 border border-zinc-300",
          )}
        >
          <TreeDeciduous className={cn(glyph, "text-zinc-200")} />
        </span>,
      )}
    </div>
  );
}

export function matchesReceiverFilter(
  receivers: UaReceivers | undefined,
  filter: UaReceiverKey[],
  mode: "all" | "any" | "exact",
): boolean {
  if (!filter.length) return true;
  const r = receivers || {};
  const activeKeys = (["transparent", "sapling", "ironwood"] as const).filter(
    (k) => !!r[k],
  );

  if (filter.includes("none") && filter.length === 1) {
    return activeKeys.length === 0;
  }

  const flags = filter.filter((f) => f !== "none") as Exclude<
    UaReceiverKey,
    "none"
  >[];
  if (!flags.length) return true;

  if (mode === "exact") {
    return (
      flags.length === activeKeys.length &&
      flags.every((f) => activeKeys.includes(f))
    );
  }
  if (mode === "all") return flags.every((f) => !!r[f]);
  return flags.some((f) => !!r[f]);
}

export function UaFilterChips({
  value,
  onChange,
}: {
  value: UaReceiverKey[];
  onChange: (next: UaReceiverKey[]) => void;
}) {
  const toggle = (key: UaReceiverKey) =>
    onChange(
      value.includes(key) ? value.filter((k) => k !== key) : [...value, key],
    );

  return (
    <div className="flex flex-wrap gap-1.5">
      {UA_FILTERS.map((b) => {
        const active = value.includes(b.key);
        return (
          <button
            key={b.key}
            type="button"
            title={b.label}
            onClick={() => toggle(b.key)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted border-border",
            )}
          >
            <UaFilterIcon kind={b.key} />
            {b.label}
          </button>
        );
      })}
    </div>
  );
}