import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { BountySuggestionCheck } from "@/lib/types";

export function unavailableBountySuggestionCheck(): BountySuggestionCheck {
  return {
    evaluatedAt: new Date().toISOString(),
    zecUsd: null,
    estimatedUsd: null,
    estimatedBand: null,
    similarBounties: [],
    flags: [
      {
        code: "check_unavailable",
        severity: "suggestion",
        message:
          "The pre-check could not run. You may still submit; a human reviewer will decide.",
      },
    ],
    aiReview: {
      status: "unavailable",
      provider: null,
      model: null,
      attempted: false,
    },
    adviceOnly: true,
  };
}

export function BountySuggestionCheckPanel({
  result,
}: {
  result: BountySuggestionCheck;
}) {
  const hasFlags = result.flags.length > 0;

  return (
    <section
      aria-live="polite"
      aria-label="Bounty suggestion pre-check"
      className="space-y-3 rounded-xl border border-border bg-muted/40 p-4"
    >
      <div className="flex items-start gap-2">
        {hasFlags ? (
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
            aria-hidden="true"
          />
        ) : (
          <CheckCircle2
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
        )}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {result.flags.length ? "Suggestions to review" : "No issues flagged"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Advice only; this does not block submission or replace human review.
            {result.zecUsd
              ? ` Rate used: $${result.zecUsd.toFixed(2)} per ZEC.`
              : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {result.aiReview?.status === "completed"
              ? `AI review by ${result.aiReview.provider} (${result.aiReview.model}${result.aiReview.confidence !== undefined ? `; ${Math.round(result.aiReview.confidence * 100)}% confidence` : ""}). The suggestion and all private and public bounty titles, descriptions, and statuses were sent to this provider.`
              : result.aiReview?.attempted
                ? "The suggestion and full text of private and public bounty records may have been sent to configured AI providers, but none completed the review."
                : "AI providers are not configured; basic local checks are shown instead."}
          </p>
        </div>
      </div>

      {result.flags.length > 0 && (
        <ul className="space-y-2 text-sm">
          {result.flags.map((flag) => (
            <li key={flag.code} className="text-muted-foreground">
              {flag.message}
            </li>
          ))}
        </ul>
      )}

      {result.similarBounties.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Possible matches
          </h4>
          <ul className="space-y-1 text-sm">
            {result.similarBounties.map((match, index) => (
              <li
                key={`${match.stage}-${match.similarity}-${index}`}
                className="flex items-start justify-between gap-3"
              >
                <span className="min-w-0 text-foreground">
                  {match.stage === "completed"
                    ? "Possible match with a completed bounty"
                    : "Possible match with a submitted bounty"}
                </span>
                <span className="shrink-0 font-medium text-muted-foreground">
                  {match.similarity}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
