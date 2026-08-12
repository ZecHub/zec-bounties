"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Image as ImageIcon, Check } from "lucide-react";
import { backendUrl } from "@/lib/configENV";

// Preset gradients — swap for uploaded images once banner upload exists.
// Reuses the same chart-token palette as the homepage hero carousel so
// it stays visually consistent with the rest of the app.
const GRADIENT_PRESETS = [
  {
    id: "primary",
    label: "Primary",
    className: "from-primary/25 via-primary/10 to-transparent",
  },
  {
    id: "chart-2",
    label: "Teal",
    className: "from-chart-2/30 via-chart-2/10 to-transparent",
  },
  {
    id: "chart-4",
    label: "Violet",
    className: "from-chart-4/30 via-chart-4/10 to-transparent",
  },
  {
    id: "chart-5",
    label: "Amber",
    className: "from-chart-5/30 via-chart-5/10 to-transparent",
  },
  {
    id: "slate",
    label: "Slate",
    className: "from-muted via-muted/40 to-transparent",
  },
] as const;

/** Deterministic pick so a given team always gets the same default banner. */
function defaultGradientFor(teamId: string) {
  const hash = teamId.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return GRADIENT_PRESETS[hash % GRADIENT_PRESETS.length];
}

interface TeamBannerProps {
  teamId: string;
  bannerUrl?: string | null; // wire this up once the backend field exists
  canManage: boolean;
}

export function TeamBanner({ teamId, bannerUrl, canManage }: TeamBannerProps) {
  const [editing, setEditing] = useState(false);
  // TODO(backend): replace this local-only state with `team.bannerColor` /
  // `team.bannerUrl` once the Team model + upload route exist, the same
  // way team.logo works today. For now this only persists client-side.
  const [gradient, setGradient] = useState(() => defaultGradientFor(teamId));

  const hasRealImage = !!bannerUrl;

  return (
    <>
      <div
        className={`relative mb-8 h-40 overflow-hidden rounded-2xl border sm:h-56 ${
          hasRealImage ? "" : `bg-gradient-to-br ${gradient.className}`
        }`}
      >
        {hasRealImage && (
          <img
            src={`${backendUrl}${bannerUrl}`}
            alt="Team banner"
            className="h-full w-full object-cover"
          />
        )}

        {canManage && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing(true)}
            className="absolute right-3 top-3 h-8 gap-1.5 rounded-full bg-background/80 backdrop-blur"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit banner
          </Button>
        )}
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Team banner</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Choose a color
              </p>
              <div className="grid grid-cols-5 gap-2">
                {GRADIENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setGradient(preset)}
                    title={preset.label}
                    className={`relative h-12 rounded-lg border bg-gradient-to-br ${preset.className} transition hover:scale-105`}
                  >
                    {gradient.id === preset.id && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Check className="h-4 w-4 drop-shadow" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-dashed p-4 text-center">
              <ImageIcon className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Image upload is coming soon — colors are available now.
              </p>
              <Button size="sm" variant="outline" disabled className="mt-3">
                Upload image
              </Button>
            </div>
          </div>

          <div className="mt-2 flex justify-end">
            <Button onClick={() => setEditing(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
