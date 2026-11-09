// utils/payoutPasskeys.js
// WebAuthn (passkey) helpers for signed payout votes. Written for
// @simplewebauthn/server v11 or newer (credential objects, not `authenticator`).
//
// A vote is valid only if the approver's passkey signed the exact vote message
// (round, bounty, chain, amount, payee, recipient, chosen executor, nonces).
// The WebAuthn challenge IS the SHA-256 of that message, so the signature covers it.
const crypto = require("crypto");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const RP_ID = process.env.WEBAUTHN_RP_ID;
const ORIGINS = (process.env.WEBAUTHN_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const RP_NAME = process.env.WEBAUTHN_RP_NAME || "ZEC Bounties";

// A newly enrolled passkey cannot vote until this has passed. Approvers are
// notified on enrollment and can revoke a pending key in the meantime.
const KEY_DELAY_MS =
  Number(process.env.PAYOUT_KEY_DELAY_HOURS ?? 72) * 3600 * 1000;

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function assertConfigured() {
  if (!RP_ID || ORIGINS.length === 0)
    throw fail(
      500,
      "WebAuthn is not configured (WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN)",
    );
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");

// A round pays a BATCH of bounties. Items are canonicalised (sorted, fixed key order) so the
// message is identical wherever it is rebuilt.
const itemsOf = (round) =>
  [...(round.items || [])]
    .sort((a, b) =>
      a.bountyId < b.bountyId ? -1 : a.bountyId > b.bountyId ? 1 : 0,
    )
    .map((i) => ({
      bountyId: i.bountyId,
      payeeId: i.payeeId,
      recipient: i.recipient,
      amountZat: String(i.amountZat),
    }));
const totalZatOf = (items) =>
  items.reduce((sum, i) => sum + BigInt(i.amountZat), 0n).toString();

// Canonical message every vote signs. Built identically at vote time and when the
// vote is re-verified at payment time, so any change to the round or its items
// (a bounty added or removed, a recipient or amount changed) invalidates it.
function voteMessage(round, candidateId, voteNonce) {
  const items = itemsOf(round);
  return JSON.stringify({
    v: 2,
    domain: "zec-bounties/payout-vote",
    round: round.id,
    nonce: round.nonce,
    voteNonce,
    team: round.teamId ?? null,
    chain: round.chain,
    totalZat: totalZatOf(items),
    items,
    executor: candidateId,
    expiresAt: new Date(round.expiresAt).toISOString(),
  });
}

const voteChallenge = (round, candidateId, voteNonce) =>
  b64u(
    crypto
      .createHash("sha256")
      .update(voteMessage(round, candidateId, voteNonce))
      .digest(),
  );

async function registrationOptions(user, existingKeys) {
  assertConfigured();
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email || user.id,
    attestationType: "none",
    excludeCredentials: existingKeys.map((k) => ({
      id: k.credentialId,
      transports: k.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
  });
}

async function verifyRegistration(response, expectedChallenge) {
  assertConfigured();
  let v;
  try {
    v = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGINS,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch (e) {
    throw fail(400, `Passkey registration failed: ${e.message}`);
  }
  if (!v.verified || !v.registrationInfo)
    throw fail(400, "Passkey registration failed");
  return v.registrationInfo.credential; // { id, publicKey, counter, transports }
}

// `key` is the entry pinned on the round: { credentialId, publicKey (base64url COSE), transports }.
// Pass the stored counter at vote time (clone detection); 0 when re-verifying later.
async function verifyVoteAssertion({
  round,
  candidateId,
  voteNonce,
  assertion,
  key,
  counter = 0,
}) {
  assertConfigured();
  const v = await verifyAuthenticationResponse({
    response: assertion,
    expectedChallenge: voteChallenge(round, candidateId, voteNonce),
    expectedOrigin: ORIGINS,
    expectedRPID: RP_ID,
    credential: {
      id: key.credentialId,
      publicKey: Uint8Array.from(Buffer.from(key.publicKey, "base64url")),
      counter,
      transports: key.transports,
    },
    requireUserVerification: true,
  });
  return { ok: v.verified, newCounter: v.authenticationInfo?.newCounter ?? 0 };
}

module.exports = {
  RP_ID,
  KEY_DELAY_MS,
  b64u,
  itemsOf,
  totalZatOf,
  voteMessage,
  voteChallenge,
  registrationOptions,
  verifyRegistration,
  verifyVoteAssertion,
};
