"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Loader2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

export const filterFieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-base imd:text-sm text-foreground";

// Matches the `imd` breakpoint from your @theme (725px).
// Below it: bottom sheet. From it up: dropdown anchored to the button.
const DESKTOP_QUERY = "(min-width: 725px)";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

/* ------------------------------------------------------------------ */
/* FilterPanel — the button + the popup (sheet on mobile, dropdown on  */
/* desktop). Put any controls inside it as children.                   */
/* ------------------------------------------------------------------ */

export function FilterPanel({
  activeCount,
  onClear,
  applyLabel = "Show results",
  loading = false,
  title = "Filters",
  align = "right",
  children,
}: {
  /** Number of active filters (drives the badge and "Clear all") */
  activeCount: number;
  onClear: () => void;
  /** Label for the mobile footer button, e.g. "Show 12 bounties" */
  applyLabel?: string;
  /** Shows a spinner in the mobile footer button */
  loading?: boolean;
  title?: string;
  /** Which edge of the button the desktop dropdown lines up with */
  align?: "left" | "right";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Desktop only — on mobile the backdrop handles outside taps.
    // Clicks inside a FilterSelect list (rendered in a portal) don't count.
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!isDesktop) return;
      const target = e.target as Element;
      if (
        wrapperRef.current?.contains(target) ||
        target.closest?.("[data-filter-portal]")
      )
        return;
      setOpen(false);
    };

    const prevOverflow = document.body.style.overflow;
    if (!isDesktop) document.body.style.overflow = "hidden";

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, isDesktop]);

  const close = () => setOpen(false);

  const panel = (
    <div
      role="dialog"
      aria-label={title}
      className={
        isDesktop
          ? `absolute top-full z-40 mt-2 flex max-h-[70dvh] w-[28rem] max-w-[calc(100vw-2rem)] origin-top animate-filter-slide flex-col rounded-xl border bg-background shadow-xl motion-reduce:animate-none ${
              align === "right" ? "right-0" : "left-0"
            }`
          : "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] animate-sheet-up flex-col rounded-t-2xl border-t bg-background shadow-2xl motion-reduce:animate-none"
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {activeCount} active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            onClick={onClear}
            disabled={activeCount === 0}
          >
            Clear all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={close}
            aria-label="Close filters"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-3">
        {children}
      </div>

      {/* Mobile-only footer */}
      {!isDesktop && (
        <div className="border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" className="w-full rounded-full" onClick={close}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </>
            ) : (
              applyLabel
            )}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative" ref={wrapperRef}>
      <Button
        type="button"
        variant={activeCount > 0 || open ? "secondary" : "outline"}
        size="sm"
        className="h-8 gap-1.5 rounded-full px-3"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden sam:inline">{title}</span>
        {activeCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>

      {open &&
        (isDesktop
          ? panel
          : createPortal(
              <>
                <button
                  type="button"
                  aria-label="Close filters"
                  tabIndex={-1}
                  className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                  onClick={close}
                />
                {panel}
              </>,
              document.body,
            ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks for the panel body                                  */
/* ------------------------------------------------------------------ */

export function FilterSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** Pill toggle — for categories, statuses, quick presets */
export function FilterChip({
  active,
  onClick,
  count,
  dotClassName,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  /** Tailwind bg class for a small leading status dot, e.g. "bg-blue-500" */
  dotClassName?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm transition ${
        active
          ? "border-primary bg-primary/10 font-semibold text-primary"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
      }`}
    >
      {dotClassName && (
        <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} />
      )}
      {children}
      {count != null && (
        <Badge
          variant="secondary"
          className="h-4 px-1.5 text-[10px] leading-none"
        >
          {count}
        </Badge>
      )}
    </button>
  );
}

/** Label + switch row — for boolean options */
export function FilterSwitch({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm">{label}</span>
        {hint && (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        )}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FilterSelect — custom dropdown whose list floats over the page      */
/* (portal + fixed positioning), so it never pushes content or gets    */
/* clipped by the scrolling panel. Flips upward near the screen bottom.*/
/* ------------------------------------------------------------------ */

export type FilterOption = { value: string; label: string };

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const below = window.innerHeight - r.bottom - gap - 8;
    const above = r.top - gap - 8;
    const openUp = below < 160 && above > below;
    setPos({
      left: r.left,
      width: r.width,
      maxHeight: Math.min(240, Math.max(120, openUp ? above : below)),
      ...(openUp
        ? { bottom: window.innerHeight - r.top + gap }
        : { top: r.bottom + gap }),
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t))
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  return (
    <div
      className={`flex min-w-0 flex-col gap-1.5 ${className}`}
      onKeyDown={(e) => {
        // Escape closes this list first, not the whole panel
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${filterFieldClass} flex items-center justify-between gap-2 text-left transition ${
          open ? "border-primary ring-2 ring-primary/20" : ""
        }`}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            aria-label={label}
            data-filter-portal
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
            }}
            className="fixed z-[60] space-y-0.5 overflow-y-auto overscroll-contain rounded-md border bg-background p-1 shadow-lg"
          >
            {options.map((o) => {
              const isSelected = o.value === value;
              return (
                <li key={o.value || "__all"} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-left text-sm transition ${
                      isSelected
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
