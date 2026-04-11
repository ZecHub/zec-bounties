const express = require("express");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const { authenticate } = require("../middleware/auth");
const { verifyZaddress, isValidZcashAddress } = require("../helpers/db-query.js");
const { zcashParams } = require("../zcash/init.js");

const router = express.Router();
const prisma = new PrismaClient();
const SECRET = process.env.JWT_SECRET;

// GitHub OAuth callback
router.get("/github/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("No code provided");

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      },
    );

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return res.status(400).send("Failed to get access token");
    }

    // Get user info from GitHub
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": "ZEC-Bounties",
      },
    });

    const userData = await userResponse.json();
    if (!userData.id) {
      return res.status(400).send("Failed to get user data");
    }

    // Create or update user
    let user = await prisma.user.findUnique({
      where: { githubId: userData.id.toString() },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          githubId: userData.id.toString(),
          username: userData.login,
          avatar: userData.avatar_url,
          email: userData.email,
        },
      });
    } else {
      // Update existing user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: userData.login,
          avatar: userData.avatar_url,
          email: userData.email || user.email,
        },
      });
    }

    // Create JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      SECRET,
      { expiresIn: "7d" },
    );

    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (error) {
    console.error("GitHub OAuth error:", error);
    res.status(500).send("Authentication failed");
  }
});

// Update user Z-address
router.patch("/profile", authenticate, async (req, res) => {
  const { z_address } = req.body;

  if (!z_address) {
    return res.status(400).json({ error: "Z-address is required" });
  }

  // Basic client-side validation
  if (!isValidZcashAddress(z_address)) {
    return res.status(400).json({ 
      error: "Please enter a valid Zcash shielded address (zs1..., u1..., or zc...)"
    });
  }

  try {
    // Full validation using zingolib
    const isValid = await verifyZaddress(z_address, zcashParams);
    
    if (!isValid) {
      return res.status(400).json({
        error: "Invalid Zcash address format or network mismatch"
      });
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { z_address },
    });

    res.json({ message: "Z-address updated successfully", user });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Get current user profile
router.get("/profile", authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        avatar: true,
        z_address: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

module.exports = router;