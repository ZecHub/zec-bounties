"use client";

// Tell a creator that a bounty like this one may already exist.
//
// Non-blocking, deliberately. The board has real duplicates — two identical
// "ZecWeekly Indonesian Translation Vol.34" posts, two "Add a FROST /
// threshold custody explainer page" posts — and the cause is that nobody was
// told, not that nobody was stopped. So this renders information and never
// touches submission, validation, or the submit button.
//
// Renders nothing at all when there is nothing to say, so the form keeps its
// usual shape for the overwhelming majority of titles.

import { useEffect, useRef, useState } from "react";
import { backendUrl } from "@/lib/configENV";

interface SimilarBounty {
  id: string;
  title: string;
  status?: string | null;
  isApproved?: boolean | null;
  similarity?: number;
}

/** Wait this long after the last keystroke before asking the server. */
const DEBOUNCE_MS = 400;

/** The server ignores anything shorter, so do not bother asking. */
const MIN_TITLE_LENGTH = 4;

const STATUS_LABELS: Record<string, string> = {
  TO_DO: "Open",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export function DuplicateBountyWarning({ title }: { title: string }) {
  const [matches, setMatches] = useState<SimilarBounty[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = title.trim();
    if (trimmed.length < MIN_TITLE_LENGTH) {
      setMatches([]);
      return;
    }

    const timer = setTimeout(async () => {
      // Abort the previous request. Without this a fast typist can have several
      // in flight and the slowest one wins, showing matches for a title they
      // have already changed.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `${backendUrl}/api/bounties/similar?title=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal, headers: { accept: "application/json" } },
        );
        if (!res.ok) return;
        const body = (await res.json()) as { similar?: SimilarBounty[] };
        setMatches(Array.isArray(body?.similar) ? body.similar : []);
      } catch {
        // A warning must never break the form it sits in. Stay quiet.
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [title]);

  if (matches.length === 0) return null;

  return (
    <div
      // Announced politely rather than assertively: it is advice appearing
      // while someone types, not an error interrupting them.
      role="status"
      aria-live="polite"
      data-testid="duplicate-bounty-warning"
      className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
    >
      <p className="font-medium text-amber-600 dark:text-amber-500">
        {matches.length === 1
          ? "A similar bounty already exists"
          : `${matches.length} similar bounties already exist`}
      </p>
      <p className="mt-1 text-muted-foreground">
        Worth a look before you post. You can still create this one.
      </p>
      <ul className="mt-2 space-y-1.5">
        {matches.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2">
            <a
              href={`/bounty/${m.id}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:no-underline"
            >
              {m.title}
            </a>
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              {STATUS_LABELS[m.status ?? ""] ?? m.status ?? "Unknown"}
            </span>
            {m.isApproved === false && (
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                Not approved
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
