"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Ban, Compass, Plus, Trophy } from "lucide-react";
import { useTaskCreationBlocked } from "@/hooks/use-task-creation-blocked";

interface Slide {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  gradient: string;
  cta: {
    label: string;
    href?: string;
    onClick?: () => void;
    icon: React.ReactNode;
  };
}

const AUTOPLAY_INTERVAL = 6000;
const DRAG_START_THRESHOLD = 6;
const SWIPE_THRESHOLD = 120;
const SWIPE_MAX_FRACTION = 0.35;

export function HeroCarousel({ onNewBounty }: { onNewBounty: () => void }) {
  const taskCreationBlocked = useTaskCreationBlocked();
  const router = useRouter();
  const [isPaused, setIsPaused] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // pos is the track position: 0..N-1 are real slides, -1 and N are clones
  const [pos, setPos] = useState(0);
  const [animate, setAnimate] = useState(true);

  // --- swipe / drag state ---
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const pointerDown = useRef(false);
  const didDrag = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const slides: Slide[] = [
    {
      id: "earn",
      eyebrow: "Get paid in ZEC",
      title: "Complete bounties, earn Zcash",
      description:
        "Browse open tasks across the ecosystem and get paid directly to your shielded wallet on completion.",
      gradient: "from-primary/15 via-primary/5 to-transparent",
      cta: {
        label: "Browse bounties",
        href: "#bounties",
        icon: <Trophy className="h-4 w-4" />,
      },
    },
    {
      id: "explore",
      eyebrow: "Find your people",
      title: "Explore teams building on Zcash",
      description:
        "Discover active teams, star your favorites, and filter bounties down to just the ones that matter to you.",
      gradient: "from-chart-4/20 via-chart-4/5 to-transparent",
      cta: {
        label: "Explore teams",
        href: "/explore",
        icon: <Compass className="h-4 w-4" />,
      },
    },
    {
      id: "create",
      eyebrow: "Have work to hand off?",
      title: taskCreationBlocked
        ? "Task creation is disabled"
        : "Post a bounty in minutes",
      description:
        "Set a reward, describe the task, and let hunters apply. Payment settles automatically once work is approved.",
      gradient: "from-chart-2/20 via-chart-2/5 to-transparent",
      cta: {
        label: "New bounty",
        onClick: onNewBounty,
        icon: taskCreationBlocked ? (
          <Ban className="h-4 w-4" />
        ) : (
          <Plus className="h-4 w-4" />
        ),
      },
    },
  ];

  const count = slides.length;
  // [last clone, ...real slides, first clone]
  const extended = [slides[count - 1], ...slides, slides[0]];
  const active = ((pos % count) + count) % count; // for the dots
  const onClone = pos < 0 || pos >= count; // waiting for the snap

  const next = useCallback(() => {
    if (onClone) return;
    setPos(pos + 1);
  }, [pos, onClone]);

  const prev = useCallback(() => {
    if (onClone) return;
    setPos(pos - 1);
  }, [pos, onClone]);

  const goTo = useCallback(
    (index: number) => {
      if (onClone) return;
      setPos(index);
    },
    [onClone],
  );

  // After sliding onto a clone, jump (no transition) to the matching real slide
  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
    if (pos < 0 || pos >= count) {
      setAnimate(false);
      setPos(pos < 0 ? count - 1 : 0);
    }
  };

  // Re-enable the transition shortly after a snap
  useEffect(() => {
    if (animate) return;
    const id = setTimeout(() => setAnimate(true), 50);
    return () => clearTimeout(id);
  }, [animate]);

  useEffect(() => {
    if (isPaused || isDragging) return;
    timeoutRef.current = setTimeout(next, AUTOPLAY_INTERVAL);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pos, isPaused, isDragging, next]);

  const handleCtaClick = (slide: Slide) => {
    if (slide.cta.onClick) {
      slide.cta.onClick();
    } else if (slide.cta.href) {
      router.push(slide.cta.href);
    }
  };

  // --- pointer handlers (work for touch, mouse and pen) ---
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (onClone) return;
    pointerDown.current = true;
    didDrag.current = false;
    startX.current = e.clientX;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerDown.current) return;
    const dx = e.clientX - startX.current;

    if (!didDrag.current) {
      if (Math.abs(dx) < DRAG_START_THRESHOLD) return;
      didDrag.current = true;
      setIsDragging(true);
      // capture only once it's a real drag so plain taps still hit the CTA
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDragX(dx);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerDown.current) return;
    pointerDown.current = false;

    if (didDrag.current) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const width = containerRef.current?.offsetWidth ?? 0;
      const threshold = Math.min(SWIPE_THRESHOLD, width * SWIPE_MAX_FRACTION);
      if (dragX <= -threshold) next();
      else if (dragX >= threshold) prev();
    }

    setDragX(0);
    setIsDragging(false);
  };

  // swallow the click that fires right after a drag so CTAs don't trigger
  const handleClickCapture = (e: React.MouseEvent) => {
    if (didDrag.current) {
      e.preventDefault();
      e.stopPropagation();
      didDrag.current = false;
    }
  };

  const trackCount = count + 2;

  return (
    <div
      ref={containerRef}
      className={`relative mb-12 overflow-hidden rounded-2xl border touch-pan-y ${
        isDragging ? "cursor-grabbing select-none" : "cursor-grab"
      }`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={handleClickCapture}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Sliding track — includes one clone slide at each end */}
      <div
        onTransitionEnd={handleTransitionEnd}
        className={`flex ${
          isDragging || !animate
            ? ""
            : "transition-transform duration-700 ease-out"
        }`}
        style={{
          width: `${trackCount * 100}%`,
          transform: `translateX(calc(-${((pos + 1) * 100) / trackCount}% + ${dragX}px))`,
        }}
      >
        {extended.map((slide, i) => (
          <div
            key={`${slide.id}-${i}`}
            className={`bg-gradient-to-br ${slide.gradient}`}
            style={{ width: `${100 / trackCount}%` }}
          >
            <div className="flex flex-col gap-4 px-6 py-6 imd:px-10 imd:py-14 imd:flex-row imd:items-center imd:justify-between">
              <div className="max-w-xl space-y-3">
                <span className="inline-block rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {slide.eyebrow}
                </span>
                <h2 className="text-2xl imd:text-3xl font-extrabold tracking-tight">
                  {slide.title}
                </h2>
                <p className="text-muted-foreground text-sm imd:text-lg">
                  {slide.description}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3 pb-2 imd:pb-0">
                {slide.cta.href && !slide.cta.onClick ? (
                  <Link href={slide.cta.href} draggable={false}>
                    <Button className="rounded-full shadow-lg shadow-primary/20">
                      {slide.cta.icon}
                      <span className="ml-2">{slide.cta.label}</span>
                    </Button>
                  </Link>
                ) : (
                  <Button
                    onClick={() => handleCtaClick(slide)}
                    title={
                      slide.cta.onClick && taskCreationBlocked
                        ? "An admin has disabled task creation for your account"
                        : undefined
                    }
                    className={`rounded-full shadow-lg shadow-primary/20 ${
                      slide.cta.onClick && taskCreationBlocked
                        ? "opacity-50"
                        : ""
                    }`}
                  >
                    {slide.cta.icon}
                    <span className="ml-2">{slide.cta.label}</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              i === active
                ? "w-6 bg-primary"
                : "w-1.5 bg-primary/25 hover:bg-primary/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
