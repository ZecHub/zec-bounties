"use client";

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
  const empty =
    !receivers ||
    (!receivers.ironwood && !receivers.sapling && !receivers.transparent);

  const iconSize = size === "md" ? "w-6 h-6" : "w-5 h-5";
  const ironwoodWrap =
    size === "md"
      ? "w-9 h-9 rounded-full bg-zinc-700 border-2 border-zinc-300"
      : "w-6 h-6 rounded-full bg-zinc-700 border-2 border-zinc-300";
  const ironwoodIcon = size === "md" ? "w-5 h-5" : "w-3.5 h-3.5";

  if (empty) {
    return (
      <div
        title="No Address"
        className="flex items-center justify-center text-red-500"
      >
        <Ban className={iconSize} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {receivers.transparent && (
        <div title="Transparent" className="flex items-center justify-center">
          <AlertTriangle className={cn(iconSize, "text-yellow-400")} />
        </div>
      )}
      {receivers.sapling && (
        <div title="Sapling" className="flex items-center justify-center">
          <Leaf className={cn(iconSize, "text-emerald-400")} />
        </div>
      )}
      {receivers.ironwood && (
        <div
          title="Ironwood"
          className={cn(
            "flex items-center justify-center",
            ironwoodWrap,
          )}
        >
          <TreeDeciduous className={cn(ironwoodIcon, "text-zinc-200")} />
        </div>
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
