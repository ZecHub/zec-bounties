// The wallet's chain and server go straight to zingo-cli as --chain and
// --server, so both must come from a fixed list. A free-form server lets a
// user make the backend connect to internal hosts or to a server they run.
const ALLOWED_CHAINS = ["mainnet", "testnet"];

const DEFAULT_SERVER_URLS = [
  "https://zec.rocks:443",
  "https://na.zec.rocks:443",
  "https://eu.zec.rocks:443",
  "https://ap.zec.rocks:443",
  "https://sa.zec.rocks:443",
  "https://testnet.zec.rocks:443",
];

// The raw value goes to zingo-cli, so it must match this exact shape. The URL
// parser alone accepts tabs, percent-encoding and other forms it rewrites.
const SERVER_URL_PATTERN = /^https?:\/\/[A-Za-z0-9.-]+(:[1-9][0-9]{0,4})?\/?$/;

function normalizeServerUrl(value) {
  if (typeof value !== "string" || !SERVER_URL_PATTERN.test(value)) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Operators add servers with ZCASH_ALLOWED_SERVER_URLS (comma-separated).
function allowedServerOrigins(env = process.env) {
  const extra = (env.ZCASH_ALLOWED_SERVER_URLS || "").split(",");
  const urls = [
    ...DEFAULT_SERVER_URLS,
    env.ZCASH_SERVER_URL,
    env.ZCASH_VERIFICATION_SERVER,
    ...extra,
  ];
  return new Set(
    urls
      .map((url) => (typeof url === "string" ? url.trim() : url))
      .map(normalizeServerUrl)
      .filter(Boolean),
  );
}

// Checks only the fields that are present. Returns an error message or null.
function validateWalletConnection({ chain, serverUrl }, env = process.env) {
  if (chain !== undefined && !ALLOWED_CHAINS.includes(chain)) {
    return `chain must be one of: ${ALLOWED_CHAINS.join(", ")}`;
  }
  if (serverUrl !== undefined) {
    const origin = normalizeServerUrl(serverUrl);
    if (!origin || !allowedServerOrigins(env).has(origin)) {
      return "serverUrl is not an allowed lightwalletd server";
    }
  }
  return null;
}

module.exports = {
  ALLOWED_CHAINS,
  DEFAULT_SERVER_URLS,
  validateWalletConnection,
};
