const { PinataSDK } = require("pinata");

if (!process.env.PINATA_JWT) {
  console.warn(
    "[pinata] PINATA_JWT is not set — uploads will fail until it's configured",
  );
}

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
});

async function uploadToPinata(file) {
  if (!process.env.PINATA_JWT) {
    throw new Error("PINATA_JWT is not configured");
  }

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
  if (!cid) return null;
  const gateway = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";
  console.log(gateway);
  return `https://${gateway}/ipfs/${cid}`;
}

module.exports = {
  uploadToPinata,
  pinataUrl,
};
