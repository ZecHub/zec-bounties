import { backendUrl } from "./configENV";

export interface DisplayNameUser {
  nickname?: string | null;
  name?: string | null;
}

export function displayName(user?: DisplayNameUser | null): string {
  return user?.nickname || user?.name || "User";
}

export interface DisplayNameBounty {
  team?: { id: string; name: string; logo?: string | null } | null;
  createdByUser?: DisplayNameUser | null;
}

export function bountyCreatorName(bounty?: DisplayNameBounty | null): string {
  return bounty?.team?.name || displayName(bounty?.createdByUser);
}

export function bountyCreatorInitial(
  bounty?: DisplayNameBounty | null,
): string {
  return bountyCreatorName(bounty).charAt(0).toUpperCase() || "?";
}

export interface DisplayNameUserWithAvatar extends DisplayNameUser {
  avatar?: string | null;
}

const ABSOLUTE_URL_RE = /^https?:\/\//;

/** Resolves a possibly-relative backend asset path to a full URL. */
function resolveAssetUrl(raw: string): string {
  return ABSOLUTE_URL_RE.test(raw) ? raw : `${backendUrl}${raw}`;
}

export function pinataUrl(cid?: string | null): string | undefined {
  if (!cid) return undefined;

  const gateway =
    process.env.NEXT_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";

  return `https://${gateway}/ipfs/${cid}`;
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
  if (bounty?.team?.logo) {
    return pinataUrl(bounty.team.logo);
  }

  return bounty?.createdByUser?.avatar
    ? resolveAssetUrl(bounty.createdByUser.avatar)
    : undefined;
}
