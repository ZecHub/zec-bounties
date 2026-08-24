"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Compass, Plus, Trophy } from "lucide-react";

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

export function HeroCarousel({ onNewBounty }: { onNewBounty: () => void }) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      title: "Post a bounty in minutes",
      description:
        "Set a reward, describe the task, and let hunters apply. Payment settles automatically once work is approved.",
      gradient: "from-chart-2/20 via-chart-2/5 to-transparent",
      cta: {
        label: "New bounty",
        onClick: onNewBounty,
        icon: <Plus className="h-4 w-4" />,
      },
    },
  ];

  const goTo = useCallback(
    (index: number) => {
      setActive((index + slides.length) % slides.length);
    },
    [slides.length],
  );

  const next = useCallback(() => goTo(active + 1), [active, goTo]);
  const prev = useCallback(() => goTo(active - 1), [active, goTo]);

  useEffect(() => {
    if (isPaused) return;
    timeoutRef.current = setTimeout(next, AUTOPLAY_INTERVAL);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [active, isPaused, next]);

  const handleCtaClick = (slide: Slide) => {
    if (slide.cta.onClick) {
      slide.cta.onClick();
    } else if (slide.cta.href) {
      router.push(slide.cta.href);
    }
  };

  return (
    <div
      className="relative mb-12 overflow-hidden rounded-2xl border"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Sliding track — width = slides.length * 100% */}
      <div
        className="flex transition-transform duration-700 ease-out"
        style={{
          width: `${slides.length * 100}%`,
          transform: `translateX(-${(active * 100) / slides.length}%)`,
        }}
      >
        {slides.map((slide) => (
          <div
            key={slide.id}
            className={`bg-gradient-to-br ${slide.gradient}`}
            style={{ width: `${100 / slides.length}%` }}
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
                  <Link href={slide.cta.href}>
                    <Button className="rounded-full shadow-lg shadow-primary/20">
                      {slide.cta.icon}
                      <span className="ml-2">{slide.cta.label}</span>
                    </Button>
                  </Link>
                ) : (
                  <Button
                    onClick={() => handleCtaClick(slide)}
                    className="rounded-full shadow-lg shadow-primary/20"
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

      {/* Arrows */}
      {/* <button
        type="button"
        onClick={prev}
        aria-label="Previous slide"
        className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full border bg-background/80 p-1.5 text-muted-foreground backdrop-blur transition hover:text-primary sm:flex"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={next}
        aria-label="Next slide"
        className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full border bg-background/80 p-1.5 text-muted-foreground backdrop-blur transition hover:text-primary sm:flex"
      >
        <ChevronRight className="h-4 w-4" />
      </button> */}

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
