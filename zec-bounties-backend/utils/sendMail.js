const transporter = require("./mailer");

function sanitizeHeaderValue(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n]+/g, " ").trim();
}

function normalizeRecipient(to) {
  if (Array.isArray(to)) {
    const cleaned = to
      .map((entry) => sanitizeHeaderValue(entry))
      .filter(Boolean);
    return cleaned.length > 0 ? cleaned : null;
  }
  const cleaned = sanitizeHeaderValue(to);
  return cleaned || null;
}

async function sendMail(options = {}) {
  const { to, subject, text, html } = options || {};
  const isProd = process.env.NODE_ENV === "production";

  // DEV OVERRIDE LOGIC
  const resolvedTo = isProd
    ? normalizeRecipient(to)
    : normalizeRecipient(process.env.DEV_EMAIL_FALLBACK) ||
      normalizeRecipient(to);

  if (!resolvedTo) {
    return null;
  }

  const cleanSubject = sanitizeHeaderValue(subject);
  const finalSubject = isProd
    ? cleanSubject
    : cleanSubject
      ? `[DEV] ${cleanSubject}`
      : "[DEV]";

  const info = await transporter.sendMail({
    from: `"ZEC Alerts" <${process.env.SMTP_USER || ""}>`,
    to: resolvedTo,
    subject: finalSubject,
    text,
    html,
  });

  console.log("MAIL INFO:", {
    response: info?.response ?? null,
  });

  return info;
}

module.exports = sendMail;
