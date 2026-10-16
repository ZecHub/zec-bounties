import type { Bounty } from "./types";

export const bountyUpdatedAt = (bounty: Bounty) =>
  bounty.updatedAt ? new Date(bounty.updatedAt).getTime() : 0;

function stripPrivateFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPrivateFields);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["email", "z_address", "UA_address"].includes(key))
        .map(([key, child]) => [key, stripPrivateFields(child)]),
    );
  }
  return value;
}

// Status payloads may omit relations. Preserve those fields, but never retain
// private user fields or let an unversioned/older update replace current data.
export function mergeBounty(current: Bounty, update: Bounty): Bounty {
  if (!update.updatedAt || bountyUpdatedAt(update) < bountyUpdatedAt(current)) {
    return current;
  }
  return stripPrivateFields({ ...current, ...update }) as Bounty;
}
