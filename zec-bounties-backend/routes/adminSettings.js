const express = require("express");
const { authenticate, isAdmin } = require("../middleware/auth");
const {
  getSuggestionSettings,
  setSuggestionSettings,
  VALID_MODES,
} = require("../utils/suggestionSettings");

const router = express.Router();

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
      const t = Number(threshold);
      if (mode === "threshold" && (!Number.isFinite(t) || t < 0 || t > 1000)) {
        return res
          .status(400)
          .json({ error: "threshold must be an integer 0–1000" });
      }
      const updated = await setSuggestionSettings({
        mode,
        threshold: mode === "threshold" ? t : 0,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating suggestion settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  },
);

module.exports = router;
