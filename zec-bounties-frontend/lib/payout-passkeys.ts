// lib/payout-passkeys.ts
// Browser side of signed payout votes. Needs: npm i @simplewebauthn/browser (v11+).
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { backendUrl } from "./configENV";

export interface PayoutKey {
  id: string;
  label: string | null;
  createdAt: string;
  activatesAt: string;
  revokedAt: string | null;
  user?: { id: string; name?: string; nickname?: string };
}

export interface VoteItem {
  bountyId: string;
  payeeId: string;
  recipient: string;
  amountZat: string;
}

// Fields of the canonical message the server asks the passkey to sign (a whole batch).
export interface VoteMessage {
  round: string;
  chain: string;
  totalZat: string;
  items: VoteItem[];
  executor: string;
  expiresAt: string;
}

async function api(path: string, init?: RequestInit) {
  const token = localStorage.getItem("authToken");
  const res = await fetch(`${backendUrl}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const listPayoutKeys = (): Promise<{
  mine: PayoutKey[];
  pending: PayoutKey[];
}> => api("/payout-keys");

export async function enrollPayoutKey(label?: string): Promise<PayoutKey> {
  const { challengeId, options } = await api("/payout-keys/register/options", {
    method: "POST",
  });
  const response = await startRegistration({ optionsJSON: options });
  return api("/payout-keys/register/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId, response, label }),
  });
}

export const revokePayoutKey = (id: string) =>
  api(`/payout-keys/${id}`, { method: "DELETE" });

// Asks the server for the exact message to sign, checks that its hash is the passkey
// challenge, shows the details to the approver, then has the passkey sign it.
export async function signPayoutVote(
  roundId: string,
  candidateId: string,
  confirm: (m: VoteMessage) => boolean | Promise<boolean>,
): Promise<{ challengeId: string; assertion: unknown }> {
  const { challengeId, message, options } = await api(
    `/payout-proposals/${roundId}/vote/options`,
    { method: "POST", body: JSON.stringify({ candidateId }) },
  );

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message),
  );
  if (b64url(digest) !== options.challenge)
    throw new Error(
      "The server's challenge does not match the vote details. Vote aborted.",
    );

  const parsed: VoteMessage = JSON.parse(message);
  if (parsed.round !== roundId || parsed.executor !== candidateId)
    throw new Error("The vote details do not match your choice. Vote aborted.");

  if (!(await confirm(parsed))) throw new Error("Vote cancelled");

  const assertion = await startAuthentication({ optionsJSON: options });
  return { challengeId, assertion };
}
