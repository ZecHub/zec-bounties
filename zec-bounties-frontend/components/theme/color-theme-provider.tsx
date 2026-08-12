"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_COLOR_THEME } from "@/lib/color-themes";

const STORAGE_KEY = "colorTheme";

interface ColorThemeContextType {
  colorTheme: string;
  setColorTheme: (id: string) => void;
}

const ColorThemeContext = createContext<ColorThemeContextType | undefined>(
  undefined,
);

export function ColorThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [colorTheme, setColorThemeState] = useState(DEFAULT_COLOR_THEME);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setColorThemeState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-color-theme", colorTheme);
  }, [colorTheme]);

  const setColorTheme = (id: string) => {
    setColorThemeState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme() {
  const ctx = useContext(ColorThemeContext);
  if (!ctx)
    throw new Error("useColorTheme must be used within a ColorThemeProvider");
  return ctx;
}
