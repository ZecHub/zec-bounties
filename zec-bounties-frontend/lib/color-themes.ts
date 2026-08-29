export interface ColorTheme {
  id: string;
  name: string;
  swatch: { light: string; dark: string; accent: string; gold?: string };
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "default",
    name: "Default",
    swatch: {
      light: "oklch(1 0 0)",
      dark: "oklch(0.145 0 0)",
      accent: "oklch(0.205 0 0)",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    swatch: {
      light: "oklch(0.98 0.01 220)",
      dark: "oklch(0.16 0.03 230)",
      accent: "oklch(0.55 0.14 220)",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    swatch: {
      light: "oklch(0.98 0.01 50)",
      dark: "oklch(0.17 0.025 30)",
      accent: "oklch(0.62 0.19 35)",
    },
  },
  {
    id: "forest",
    name: "Forest",
    swatch: {
      light: "oklch(0.98 0.01 140)",
      dark: "oklch(0.15 0.025 150)",
      accent: "oklch(0.5 0.13 150)",
    },
  },
  {
    id: "ledger",
    name: "Ledger",
    swatch: {
      light: "oklch(0.98 0.004 240)",
      dark: "oklch(0.16 0.006 250)",
      accent: "oklch(0.8 0.16 80)",
      gold: "oklch(0.8 0.16 80)",
    },
  },
  //   {
  //     id: "zcash",
  //     name: "Zcash",
  //     swatch: {
  //       light: "oklch(1 0 0)",
  //       dark: "#000000",
  //       accent: "#f4b728",
  //       gold: "#f4b728",
  //     },
  //   },
];

export const DEFAULT_COLOR_THEME = "default";
