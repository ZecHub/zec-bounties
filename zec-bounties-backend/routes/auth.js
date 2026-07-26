const path = require("path");
const express = require("express");
const axios = require("axios");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../prisma/client");
const { authenticate, isAdmin } = require("../middleware/auth");
const { verifyZaddress, verifyUaddress } = require("../helpers/db-query.js");
const {
  getLatestZcashParams,
  getLatestZcashParamsForClientUser,
} = require("../helpers/zcash/zcashHelper.js");
const sendMail = require("../utils/sendMail");
const executeZingoCliRecoveryInfo = require("../utils/zingo/zingoLibRecoveryInfo");
const { delCache, deleteCacheByPattern } = require("../utils/cache");
const { sendRealtimeUpdate } = require("../middleware/websocket");

// const { isSaplingZcashAddress } = require("../utils/zingo/zingoLib/parseAddresses");
const router = express.Router();
const SECRET = process.env.JWT_SECRET;

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

router.get("/github", (req, res) => {
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=user:email`;
  res.redirect(githubAuthUrl); // Sends user to GitHub
});

// GitHub calls this route after user authenticates OR cancels
router.get("/github/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  // Handle user cancellation or errors from GitHub
  if (error) {
    console.log(`GitHub OAuth error: ${error} - ${error_description}`);
    return res.redirect(`${FRONTEND_URL}/login?error=oauth_cancelled`);
  }

  // Handle missing authorization code
  if (!code) {
    console.log("No authorization code received from GitHub");
    return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code: code,
      },
      {
        headers: {
          Accept: "application/json", // Important: Get JSON response
        },
      },
    );

    const accessToken = tokenResponse.data.access_token;

    if (!accessToken) {
      console.log("No access token received from GitHub");
      return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    }

    // Get user info from GitHub
    const userResponse = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Get user's email addresses (GitHub API returns this separately)
    const emailResponse = await axios.get(
      "https://api.github.com/user/emails",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const githubUser = userResponse.data;
    const emails = emailResponse.data;
    const primaryEmail =
      emails.find((email) => email.primary)?.email || githubUser.email;

    if (!primaryEmail) {
      console.log("No email found for GitHub user");
      return res.redirect(`${FRONTEND_URL}/login?error=no_email`);
    }

    // Create/find user in YOUR database
    let user = await prisma.user.findUnique({
      where: { email: primaryEmail },
    });

    if (!user) {
      // Generate a unique nickname
      let nickname = githubUser.login.toLowerCase();

      const exists = await prisma.user.findUnique({
        where: { nickname },
      });

      if (exists) {
        nickname = `${nickname}.${Math.floor(Math.random() * 10000)}`;
      }

      // Create new user
      user = await prisma.user.create({
        data: {
          name: githubUser.name || githubUser.login,
          nickname,
          email: primaryEmail,
          githubId: githubUser.id.toString(),
          avatar: githubUser.avatar_url,
          role: "CLIENT",
        },
      });
    } else if (!user.githubId) {
      // Link GitHub account to existing user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubId: githubUser.id.toString(),
          avatar: githubUser.avatar_url,
        },
      });
    }

    // Generate YOUR app's JWT token
    const token = jwt.sign({ id: user.id, role: user.role }, SECRET, {
      expiresIn: "7d",
    });

    // Redirect back to frontend with token
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (error) {
    console.error("GitHub OAuth error:", error.message);
    res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
});

router.get("/verify", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ user: decoded }); // contains id, role, email if you put them in JWT
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

// utest18jxt2wjaklhtny5hx8xp7036v0qpy76j0rcsczsw34prh2svs6qst5eumxm35k9lpf3efxf0rayhh2u85zspp7m7z5w6288n2vzzu5u8

router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        nickname: true,
        email: true,
        role: true,
        avatar: true,
        z_address: true,
        UA_address: true,
        isRobin: true,
        emailNotifications: true,
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json({ user });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

router.patch("/update-email-notifications", authenticate, async (req, res) => {
  try {
    const { emailNotifications } = req.body;
    if (typeof emailNotifications !== "boolean") {
      return res
        .status(400)
        .json({ error: "emailNotifications must be a boolean" });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { emailNotifications },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        nickname: true,
        isRobin: true,
        isManOfSteel: true,
        z_address: true,
        UA_address: true,
        emailNotifications: true,
      },
    });

    await delCache("users:all");
    sendRealtimeUpdate("user_updated", updated, req.user.id);
    res.json({ user: updated });
  } catch (error) {
    console.error("Failed to update email notifications:", error);
    res.status(500).json({ error: "Failed to update preference" });
  }
});

router.post("/verify-zaddress", authenticate, async (req, res) => {
  try {
    const { z_address } = req.body;

    // Get params based on user role
    let params;
    if (req.user.role === "CLIENT") {
      params = await getLatestZcashParamsForClientUser();
    } else {
      params = await getLatestZcashParams(req.user.id);
    }

    if (!params) {
      return res.status(404).json({
        error: "No Zcash params found. Initialize wallet first.",
      });
    }

    const result = await verifyZaddress(z_address, params);
    console.log("Verification result:", result);

    return res.json({ isVerified: result });
  } catch (err) {
    console.error("Error verifying Z-address:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/verify-uaddress", authenticate, async (req, res) => {
  try {
    const { z_address } = req.body;

    // Get params based on user role
    let params;
    if (req.user.role === "CLIENT") {
      params = await getLatestZcashParamsForClientUser();
    } else {
      params = await getLatestZcashParams(req.user.id);
    }

    if (!params) {
      return res.status(404).json({
        error: "No Zcash params found. Initialize wallet first.",
      });
    }

    const result = await verifyUaddress(z_address, params);
    console.log("Verification result:", result);

    return res.json({ isVerified: result });
  } catch (err) {
    console.error("Error verifying Z-address:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Check if user has Zcash params set up
router.get("/has-zcash-params", authenticate, async (req, res) => {
  try {
    let params;
    if (req.user.role === "CLIENT") {
      params = await getLatestZcashParamsForClientUser();
    } else {
      params = await getLatestZcashParams(req.user.id);
    }

    return res.json({
      hasParams: !!params,
      message: params ? "Zcash params found" : "No Zcash params found",
    });
  } catch (err) {
    console.error("Error checking Zcash params:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/update-zaddress", authenticate, async (req, res) => {
  const { z_address } = req.body;

  // const validAddress = verifyZaddress(z_address);

  const validAddress = true;

  if (!validAddress) {
    return res.status(400).json({ error: "Invalid z_address" });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { z_address },
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        z_address: true,
      },
    });

    res.json({ message: "Z-address updated successfully", user: updatedUser });
  } catch (error) {
    console.error("Error updating z_address:", error);
    res.status(500).json({ error: "Failed to update z_address" });
  }
});

// In-memory OTP store  { userId: { otp, expiresAt } }
const otpStore = new Map();

// Step 1: Request OTP
router.post("/recovery/request-otp", authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true, name: true, nickname: true },
    });

    if (!user?.email) {
      return res
        .status(400)
        .json({ error: "No email associated with account" });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Overwrite any existing OTP for this user
    otpStore.set(req.user.id, { otp, expiresAt });

    // Send email — plug in your mailer here (nodemailer, resend, sendgrid, etc.)
    await sendRecoveryOtpEmail(user.email, user.name, otp);

    res.json({ message: "OTP sent", email: maskEmail(user.email) });
  } catch (err) {
    console.error("OTP request error:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// Step 2: Verify OTP + return sensitive wallet data
router.post("/recovery/verify-otp", authenticate, async (req, res) => {
  const { otp, accountName } = req.body;

  if (!otp || !accountName) {
    return res.status(400).json({ error: "OTP and accountName required" });
  }

  const record = otpStore.get(req.user.id);

  if (!record) {
    return res
      .status(401)
      .json({ error: "No OTP requested. Request a new one." });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(req.user.id);
    return res.status(401).json({ error: "OTP expired. Request a new one." });
  }

  if (record.otp !== otp) {
    return res.status(401).json({ error: "Incorrect OTP" });
  }

  // Valid — consume immediately
  otpStore.delete(req.user.id);

  try {
    // Verify wallet belongs to this user and get its config
    const zcashParam = await prisma.zcashParams.findFirst({
      where: { accountName, ownerId: req.user.id },
      select: {
        accountName: true,
        chain: true,
        serverUrl: true,
        isTeam: true,
        teamId: true,
      },
    });

    if (!zcashParam) {
      return res
        .status(404)
        .json({ error: "Wallet not found or access denied" });
    }

    // Build dataDir the same way zcashHelper does
    const dataDir =
      zcashParam.isTeam && zcashParam.teamId
        ? path.join(
            process.cwd(),
            "wallets",
            `team:${zcashParam.teamId}`,
            accountName,
            zcashParam.chain,
          )
        : path.join(
            process.cwd(),
            "wallets",
            req.user.id,
            accountName,
            zcashParam.chain,
          );

    const params = { ...zcashParam, dataDir };

    const recoveryInfo = await executeZingoCliRecoveryInfo(
      "recovery_info",
      params,
    );

    res.json({ data: recoveryInfo });
  } catch (err) {
    console.error("Recovery fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/update-ua-address", authenticate, async (req, res) => {
  const { UA_address } = req.body;
  if (!UA_address?.startsWith("u1")) {
    return res.status(400).json({ error: "Invalid mainnet unified address" });
  }
  try {
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { UA_address },
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        UA_address: true,
      },
    });
    res.json({ message: "Mainnet address updated", user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: "Failed to update UA_address" });
  }
});

router.patch("/update-nickname", authenticate, async (req, res) => {
  try {
    let { nickname } = req.body;

    nickname = nickname?.trim().toLowerCase();

    if (!nickname) {
      return res.status(400).json({
        error: "Nickname is required.",
      });
    }

    if (!/^[a-z0-9._-]{3,32}$/.test(nickname)) {
      return res.status(400).json({
        error:
          "Nickname must be 3-32 characters and contain only lowercase letters, numbers, periods (.), hyphens (-), and underscores (_).",
      });
    }

    // Check uniqueness
    const existing = await prisma.user.findUnique({
      where: { nickname },
    });

    if (existing && existing.id !== req.user.id) {
      return res.status(409).json({
        error: "Nickname is already taken.",
      });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { nickname: nickname?.trim() || null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        nickname: true,
        isRobin: true,
        isManOfSteel: true,
        z_address: true,
        UA_address: true,
        emailNotifications: true,
      },
    });

    await Promise.all([
      delCache("users:all"),
      deleteCacheByPattern("bounties:*"),
      deleteCacheByPattern("bounty:*"),
      deleteCacheByPattern("assignees:*"),
      deleteCacheByPattern("applications:*"),
      deleteCacheByPattern("submissions:*"),
    ]);
    sendRealtimeUpdate("user_updated", updated, req.user.id);

    res.json({ user: updated });
  } catch (error) {
    console.error("Failed to update nickname:", error);
    res.status(500).json({ error: "Failed to update nickname" });
  }
});

// Helpers
function maskEmail(email) {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

async function sendRecoveryOtpEmail(email, name, otp) {
  await sendMail({
    to: email,
    subject: "Recovery Verification Code",
    text: "Your OTP is " + otp,
    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2>Recovery Verification</h2>

        <p>Hello ${name || "User"},</p>

        <p>You requested access to your wallet recovery information.</p>

        <p>Your verification code is:</p>

        <h1 style="letter-spacing: 4px;">${otp}</h1>

        <p>This code expires in 5 minutes.</p>

        <p>If you did not make this request, please ignore this email.</p>
      </div>
    `,
  });
}

module.exports = router;
