import type { Bounty, User } from "./types";

export const bountyUpdatedAt = (bounty: Bounty) =>
  bounty.updatedAt ? new Date(bounty.updatedAt).getTime() : 0;

function stripPrivateFields(value: unknown, keepAddresses = false): unknown {
  const drop = keepAddresses
    ? ["email"]
    : ["email", "z_address", "UA_address"];
  if (Array.isArray(value)) {
    return value.map((item) => stripPrivateFields(item, keepAddresses));
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !drop.includes(key))
        .map(([key, child]) => [key, stripPrivateFields(child, keepAddresses)]),
    );
  }
  return value;
}

function mergeUser(
  current: User | null | undefined,
  update: User | null | undefined,
  keepAddresses: boolean,
): User | null | undefined {
  if (!update) return current ?? update;
  if (!current) return update;
  const merged = { ...current, ...update };
  delete (merged as { email?: string }).email;
  if (keepAddresses) {
    if (update.UA_address == null && current.UA_address != null) {
      merged.UA_address = current.UA_address;
    }
    if (update.z_address == null && current.z_address != null) {
      merged.z_address = current.z_address;
    }
  } else {
    delete merged.UA_address;
    delete merged.z_address;
  }
  return merged;
}

export function mergeBounty(
  current: Bounty,
  update: Bounty,
  options?: { preservePayoutAddresses?: boolean },
): Bounty {
  if (!update.updatedAt || bountyUpdatedAt(update) < bountyUpdatedAt(current)) {
    return current;
  }
  const keepAddresses = options?.preservePayoutAddresses === true;
  const merged = stripPrivateFields(
    { ...current, ...update },
    keepAddresses,
  ) as Bounty;
  return {
    ...merged,
    assigneeUser: mergeUser(current.assigneeUser, merged.assigneeUser, keepAddresses),
    createdByUser: mergeUser(current.createdByUser, merged.createdByUser, keepAddresses),
  };
}