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
  const { challengeId, message, options } = await api(
    `/teams/${teamId}/wallet/recovery/requests/${approvalId}/challenge`,
    { method: "POST" },
  );

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message),
  );
  if (b64url(digest) !== options.challenge)
    throw new Error(
      "The server's challenge does not match the request details. Aborted.",
    );

  const parsed: RecoveryMessage = JSON.parse(message);
  if (parsed.approval !== approvalId || parsed.team !== teamId)
    throw new Error("The request details do not match. Aborted.");

  if (!(await confirm(parsed))) throw new Error("Approval cancelled");

  const assertion = await startAuthentication({ optionsJSON: options });
  return { challengeId, assertion };
}
