import { backendUrl } from "./configENV";

export interface DisplayNameUser {
  nickname?: string | null;
  name?: string | null;
}

function cleanText(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function displayName(user?: DisplayNameUser | null): string {
  return cleanText(user?.nickname) || cleanText(user?.name) || "User";
}

export interface DisplayNameBounty {
  team?: { id: string; name: string; logo?: string | null } | null;
  createdByUser?: DisplayNameUser | null;
}

export function bountyCreatorName(bounty?: DisplayNameBounty | null): string {
  return cleanText(bounty?.team?.name) || displayName(bounty?.createdByUser);
}

export function bountyCreatorInitial(
  bounty?: DisplayNameBounty | null,
): string {
  const first = Array.from(bountyCreatorName(bounty))[0];
  return first ? first.toUpperCase() : "?";
}

export interface DisplayNameUserWithAvatar extends DisplayNameUser {
  avatar?: string | null;
}

const ABSOLUTE_URL_RE = /^https?:\/\//i;

/** Resolves a possibly-relative backend asset path to a full URL. */
function resolveAssetUrl(raw: string): string {
  const trimmed = raw.trim();
  if (ABSOLUTE_URL_RE.test(trimmed)) return trimmed;
  const base = backendUrl.replace(/\/+$/, "");
  const path = trimmed.replace(/^\/+/, "");
  return `${base}/${path}`;
}

export function pinataUrl(cid?: string | null): string | undefined {
  const trimmed = cleanText(cid);
  if (!trimmed) return undefined;
  if (ABSOLUTE_URL_RE.test(trimmed)) return trimmed;

  const normalizedCid = trimmed.replace(/^ipfs:\/\//i, "").replace(/^\/+/, "");
  if (!normalizedCid) return undefined;

  const rawGateway =
    cleanText(process.env.NEXT_PUBLIC_PINATA_GATEWAY) || "gateway.pinata.cloud";
  const gateway = rawGateway.replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  return `https://${gateway}/ipfs/${normalizedCid}`;
}

/**
 * Avatar image src for a bounty's creator — team logo takes precedence
 * over the individual user's personal avatar when the bounty was posted
 * under a Team org. Returns undefined (not a placeholder) when neither
 * exists, so callers can fall through to AvatarFallback.
 */
export function bountyCreatorAvatarSrc(
  bounty?:
    | (DisplayNameBounty & {
        createdByUser?: DisplayNameUserWithAvatar | null;
      })
    | null,
): string | undefined {
  const teamLogo = cleanText(bounty?.team?.logo);
  if (teamLogo) {
    return pinataUrl(teamLogo);
  }

  const userAvatar = cleanText(bounty?.createdByUser?.avatar);
  return userAvatar ? resolveAssetUrl(userAvatar) : undefined;
}
