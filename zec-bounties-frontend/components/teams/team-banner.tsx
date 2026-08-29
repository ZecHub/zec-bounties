"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Image as ImageIcon, Check, Loader2, X } from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import { cn } from "@/lib/utils";

// Preset gradients — used as a fallback when the team has no uploaded banner.
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

// Downscale + re-encode large banner images client-side before upload.
// Wide cover photos routinely come in as multi-MB PNGs/screenshots; most
// of that is wasted since the banner only ever renders at h-40/h-56.
// SVGs are skipped — they're vector and already small.
const BANNER_MAX_WIDTH = 1920;
const BANNER_MAX_HEIGHT = 640;
const BANNER_JPEG_QUALITY = 0.85;

async function downscaleImageIfNeeded(file: File): Promise<File> {
  if (file.type === "image/svg+xml") return file;

  try {
    const bitmap = await createImageBitmap(file);

    const scale = Math.min(
      1,
      BANNER_MAX_WIDTH / bitmap.width,
      BANNER_MAX_HEIGHT / bitmap.height,
    );

    // Already small enough — don't bother re-encoding (avoids
    // needlessly re-compressing a file that's already fine).
    if (scale === 1 && file.size <= 2 * 1024 * 1024) {
      bitmap.close();
      return file;
    }

    const targetWidth = Math.round(bitmap.width * scale);
    const targetHeight = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", BANNER_JPEG_QUALITY),
    );

    if (!blob) return file;

    // Only use the re-encoded version if it's actually smaller —
    // a tiny/already-compressed source can occasionally grow under JPEG.
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch (err) {
    // Any failure here (unsupported format, decode error, etc.) — just
    // fall back to the original file and let the backend's own limit
    // and validation be the final word.
    console.warn("Banner downscale skipped:", err);
    return file;
  }
}

interface TeamBannerProps {
  teamId: string;
  bannerUrl?: string | null; // full gateway URL now, or null
  canManage: boolean;
  className?: string;
}

export function TeamBanner({
  teamId,
  bannerUrl,
  canManage,
  className,
}: TeamBannerProps) {
  const { uploadTeamBanner, removeTeamBanner } = useBounty();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Purely cosmetic fallback — only shown when there's no real banner.
  const [gradient, setGradient] = useState(() => defaultGradientFor(teamId));

  const hasRealImage = !!bannerUrl;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const processedFile = await downscaleImageIfNeeded(file);
      await uploadTeamBanner(teamId, processedFile);
      setEditing(false);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to upload banner");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    setError(null);
    try {
      await removeTeamBanner(teamId);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to remove banner");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          `relative mb-8 aspect-3/1 w-full shrink-0 overflow-hidden rounded-2xl border border-accent imd:h-56 ${
            hasRealImage ? "" : `bg-linear-to-br ${gradient.className}`
          }`,
          className,
        )}
      >
        {/* <div
        className={`relative mb-8 h-40 overflow-hidden rounded-2xl border imd:h-56 ${
          hasRealImage ? "" : `bg-gradient-to-br ${gradient.className}`
        }`}
      > */}
        {hasRealImage && (
          <img
            src={bannerUrl!}
            alt="Team banner"
            className="h-full w-full object-fill imd:object-cover"
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
            <div className="rounded-lg border border-dashed p-4 text-center">
              <ImageIcon className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                PNG, JPEG, WEBP, or SVG. Max 15MB.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="mt-3 flex justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : hasRealImage ? (
                    "Replace image"
                  ) : (
                    "Upload image"
                  )}
                </Button>
                {hasRealImage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRemove}
                    disabled={uploading}
                    className="text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-600"
                  >
                    <X className="mr-1 h-3.5 w-3.5" /> Remove
                  </Button>
                )}
              </div>
              {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
            </div>

            {!hasRealImage && (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Or pick a color (used until you upload an image)
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
            )}
          </div>

          <div className="mt-2 flex justify-end">
            <Button onClick={() => setEditing(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
