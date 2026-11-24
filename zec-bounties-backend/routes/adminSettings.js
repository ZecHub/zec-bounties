const express = require("express");
const { authenticate, isAdmin } = require("../middleware/auth");
const {
  getSuggestionSettings,
  setSuggestionSettings,
  VALID_MODES,
} = require("../utils/suggestionSettings");

const router = express.Router();

function parseThreshold(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 1000
      ? value
      : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1000
      ? parsed
      : null;
  }
  return null;
}

router.get("/suggestion-settings", authenticate, isAdmin, async (req, res) => {
  try {
    const settings = await getSuggestionSettings();
    res.json(settings);
  } catch (error) {
    console.error("Error reading suggestion settings:", error);
    res.status(500).json({ error: "Failed to read settings" });
  }
});

router.patch(
  "/suggestion-settings",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { mode, threshold } = req.body || {};
      if (!VALID_MODES.has(mode)) {
        return res.status(400).json({
          error: "mode must be one of: closed, open, threshold",
        });
      }
      const parsedThreshold =
        mode === "threshold" ? parseThreshold(threshold) : 0;
      if (mode === "threshold" && parsedThreshold === null) {
        return res
          .status(400)
          .json({ error: "threshold must be an integer 0–1000" });
      }
      const updated = await setSuggestionSettings({
        mode,
        threshold: parsedThreshold,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating suggestion settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  },
);

router.parseThreshold = parseThreshold;

module.exports = router;
