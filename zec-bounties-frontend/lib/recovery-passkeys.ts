import { startAuthentication } from "@simplewebauthn/browser";
import { api, b64url } from "./payout-passkeys";

export interface RecoveryMessage {
  approval: string;
  team: string;
  requester: string;
  threshold: number;
  approvers: string[];
}

export async function signRecoveryApproval(
  teamId: string,
  approvalId: string,
  confirm: (m: RecoveryMessage) => boolean | Promise<boolean>,
): Promise<{ challengeId: string; assertion: unknown }> {
  const response = await api(
    `/teams/${encodeURIComponent(teamId)}/wallet/recovery/requests/${encodeURIComponent(approvalId)}/challenge`,
    { method: "POST" },
  );
  const { challengeId, message, options } = response ?? {};
  if (
    typeof challengeId !== "string" ||
    !challengeId ||
    typeof message !== "string" ||
    !options ||
    typeof options.challenge !== "string"
  ) {
    throw new Error("The server returned an invalid recovery challenge. Aborted.");
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message),
  );
  if (b64url(digest) !== options.challenge)
    throw new Error(
      "The server's challenge does not match the request details. Aborted.",
    );

  let parsed: RecoveryMessage;
  try {
    const decoded = JSON.parse(message);
    if (!decoded || typeof decoded !== "object") {
      throw new Error("Invalid recovery message payload");
    }
    parsed = decoded as RecoveryMessage;
  } catch {
    throw new Error(
      "The server's recovery request details could not be parsed. Aborted.",
    );
  }
  if (parsed.approval !== approvalId || parsed.team !== teamId)
    throw new Error("The request details do not match. Aborted.");

  if (!(await confirm(parsed))) throw new Error("Approval cancelled");

  const assertion = await startAuthentication({ optionsJSON: options });
  return { challengeId, assertion };
}
