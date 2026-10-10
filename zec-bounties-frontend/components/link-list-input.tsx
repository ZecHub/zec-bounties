"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_LINKS } from "@/lib/links";

const inputCls =
  "w-full rounded-md border bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function LinkListInput({
  id,
  values,
  onChange,
  invalid,
  describedBy,
}: {
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="space-y-1.5">
      {values.map((value, i) => {
        const isLast = i === values.length - 1;
        return (
          <div key={i} className="flex items-center gap-1.5">
            <input
              id={i === 0 ? id : undefined}
              type="url"
              placeholder="https://github.com/username/repo"
              value={value}
              onChange={(e) =>
                onChange(
                  values.map((v, idx) => (idx === i ? e.target.value : v)),
                )
              }
              className={inputCls}
              autoComplete="off"
              aria-label={`Link ${i + 1}`}
              aria-invalid={invalid}
              aria-describedby={describedBy}
            />
            {values.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground"
                onClick={() => onChange(values.filter((_, idx) => idx !== i))}
                aria-label={`Remove link ${i + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            {isLast && values.length < MAX_LINKS && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => onChange([...values, ""])}
                aria-label="Add another link"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
