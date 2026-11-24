const { PinataSDK } = require("pinata");

if (!process.env.PINATA_JWT) {
  console.warn(
    "[pinata] PINATA_JWT is not set — uploads will fail until it's configured",
  );
}

let cachedJwt = null;
let cachedClient = null;

function getPinataClient() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error("PINATA_JWT is not configured");
  }
  if (!cachedClient || cachedJwt !== jwt) {
    cachedClient = new PinataSDK({ pinataJwt: jwt });
    cachedJwt = jwt;
  }
  return cachedClient;
}

async function uploadToPinata(file) {
  const pinata = getPinataClient();

  if (!file?.buffer) {
    throw new Error("No file buffer provided");
  }

  const pinataFile = new File([file.buffer], file.originalname, {
    type: file.mimetype,
  });

  return pinata.upload.public.file(pinataFile);
}

/**
 * Build a displayable gateway URL from a stored CID.
 * Team.logo / Team.banner store the raw CID string, so this is what
 * turns that into something an <img src> can actually load.
 */
function pinataUrl(cid) {
  if (typeof cid !== "string") return null;
  const normalizedCid = cid
    .trim()
    .replace(/^ipfs:\/\//i, "")
    .replace(/^\/?ipfs\//i, "")
    .replace(/^\/+/, "");
  if (!normalizedCid) return null;

  const rawGateway = (process.env.PINATA_GATEWAY || "").trim();
  const gateway =
    rawGateway
      .replace(/^https?:\/\//i, "")
      .replace(/\/ipfs\/?$/i, "")
      .replace(/\/+$/, "") || "gateway.pinata.cloud";

  return `https://${gateway}/ipfs/${normalizedCid}`;
}

module.exports = {
  uploadToPinata,
  pinataUrl,
};
