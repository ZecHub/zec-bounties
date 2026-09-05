"use client";

import { useTheme } from "next-themes";
import {
  ASSIGNABLE_BADGES,
  BADGE_LABELS,
  SPECIALTY_FILTERS,
  STAR_FILTERS,
  badgeAssetPath,
  effectiveStarKey,
  specialtyBadgeKeys,
} from "@/lib/badges";
import { cn } from "@/lib/utils";

function useBadgeFolder(): "Dark-Mode" | "Light-Mode" {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "Dark-Mode" : "Light-Mode";
}

export function BadgeSvg({
  badgeKey,
  title,
  className = "w-5 h-5",
}: {
  badgeKey: string;
  title?: string;
  className?: string;
}) {
  const folder = useBadgeFolder();
  const label = title || BADGE_LABELS[badgeKey] || badgeKey;
  return (
    <img
      src={badgeAssetPath(folder, badgeKey)}
      alt={label}
      title={label}
      className={cn("object-contain", className)}
    />
  );
}

export function BadgeIcons({
  completed = 0,
  badges = [],
  role,
  className,
  iconClassName = "w-5 h-5 object-contain",
}: {
  completed?: number;
  badges?: string[];
  role?: string;
  className?: string;
  iconClassName?: string;
}) {
  const star = effectiveStarKey(completed, badges);
  const extras = specialtyBadgeKeys(badges, role);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span title={BADGE_LABELS[star]}>
        <BadgeSvg badgeKey={star} className={iconClassName} />
      </span>
      {extras.map((key) => (
        <span key={key} title={BADGE_LABELS[key] || key}>
          <BadgeSvg badgeKey={key} className={iconClassName} />
        </span>
      ))}
    </div>
  );
}

export function SpecialtyFilterChips({
  value,
  onChange,
  compact = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  compact?: boolean;
}) {
  const toggle = (key: string) =>
    onChange(
      value.includes(key) ? value.filter((k) => k !== key) : [...value, key],
    );

  return (
    <div className="flex flex-wrap gap-1.5">
      {SPECIALTY_FILTERS.map((b) => {
        const active = value.includes(b.key);
        return (
          <button
            key={b.key}
            type="button"
            title={b.label}
            onClick={() => toggle(b.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded border text-xs",
              compact ? "px-2 py-0.5" : "h-7 px-2",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted border-border",
            )}
          >
            <BadgeSvg badgeKey={b.key} className="w-3.5 h-3.5" />
            {b.label}
          </button>
        );
      })}
    </div>
  );
}

export function StarFilterChips({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (key: string) =>
    onChange(
      value.includes(key) ? value.filter((k) => k !== key) : [...value, key],
    );

  return (
    <div className="flex flex-wrap gap-1.5">
      {STAR_FILTERS.map((b) => {
        const active = value.includes(b.key);
        return (
          <button
            key={b.key}
            type="button"
            title={b.label}
            onClick={() => toggle(b.key)}
            className={cn(
              "inline-flex items-center justify-center w-8 h-8 rounded border",
              active
                ? "bg-primary/15 border-primary"
                : "hover:bg-muted border-border",
            )}
          >
            <BadgeSvg badgeKey={b.key} className="w-5 h-5" />
          </button>
        );
      })}
    </div>
  );
}

export function AssignableBadgeList({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="space-y-2">
      {ASSIGNABLE_BADGES.map((badge) => (
        <label
          key={badge.key}
          className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted cursor-pointer"
        >
          <input
            type="checkbox"
            checked={selected.includes(badge.key)}
            onChange={() => onToggle(badge.key)}
            className="h-4 w-4 accent-primary"
          />
          <div className="flex items-center gap-2">
            <BadgeSvg badgeKey={badge.key} className="w-5 h-5" />
            <span>{badge.label}</span>
          </div>
        </label>
      ))}
    </div>
  );
}

export const STAR_OVERRIDE_OPTIONS: {
  value: string;
  label: string;
  star: string | null;
}[] = [
  {
    value: "avatar:default",
    label: "Default (based on completed bounties)",
    star: null,
  },
  { value: "avatar:1", label: "1 Task", star: "1-task" },
  { value: "avatar:5", label: "5 Tasks", star: "5-tasks" },
  { value: "avatar:10", label: "10 Tasks", star: "10-tasks" },
  { value: "avatar:15", label: "15 Tasks", star: "15-tasks" },
  { value: "avatar:25", label: "25 Tasks", star: "25-tasks" },
  { value: "avatar:50", label: "50 Tasks", star: "50-tasks" },
];
