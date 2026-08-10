"use client";

import { Check, Palette } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useColorTheme } from "@/components/theme/color-theme-provider";
import { COLOR_THEMES } from "@/lib/color-themes";

export function ThemePicker() {
  const { colorTheme, setColorTheme } = useColorTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Palette className="h-4 w-4" />
          <span className="sr-only">Change color theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Color theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="grid grid-cols-2 gap-1.5 p-1.5">
          {COLOR_THEMES.map((t) => {
            const active = colorTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setColorTheme(t.id)}
                className={`flex flex-col gap-1.5 rounded-md border p-2 text-left transition ${
                  active ? "border-primary" : "hover:border-primary/40"
                }`}
              >
                <div className="flex h-6 overflow-hidden rounded">
                  <span
                    className="flex-1"
                    style={{ backgroundColor: t.swatch.light }}
                  />
                  <span
                    className="flex-1"
                    style={{ backgroundColor: t.swatch.dark }}
                  />
                </div>
                <span className="flex items-center justify-between text-xs font-medium">
                  {t.name}
                  {active && <Check className="h-3 w-3 text-primary" />}
                </span>
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
