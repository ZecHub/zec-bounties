import type { Bounty, User } from "./types";

export const bountyUpdatedAt = (bounty: Bounty) => {
  if (!bounty.updatedAt) return 0;
  const ts = new Date(bounty.updatedAt).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

function hasValidUpdatedAt(bounty: Bounty): boolean {
  if (!bounty.updatedAt) return false;
  return Number.isFinite(new Date(bounty.updatedAt).getTime());
}

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
  if (update === null) return null;
  if (!update) {
    return current
      ? (stripPrivateFields(current, keepAddresses) as User)
      : update;
  }
  const cleanUpdate = stripPrivateFields(update, keepAddresses) as User;
  if (!current) return cleanUpdate;
  const cleanCurrent = stripPrivateFields(current, keepAddresses) as User;
  const merged = { ...cleanCurrent, ...cleanUpdate };
  delete (merged as { email?: string }).email;
  if (keepAddresses) {
    if (cleanUpdate.UA_address == null && cleanCurrent.UA_address != null) {
      merged.UA_address = cleanCurrent.UA_address;
    }
    if (cleanUpdate.z_address == null && cleanCurrent.z_address != null) {
      merged.z_address = cleanCurrent.z_address;
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
  if (
    !hasValidUpdatedAt(update) ||
    bountyUpdatedAt(update) < bountyUpdatedAt(current)
  ) {
    return current;
  }
  const keepAddresses = options?.preservePayoutAddresses === true;
  const merged = stripPrivateFields(
    { ...current, ...update },
    keepAddresses,
  ) as Bounty;
  return {
    ...merged,
    assigneeUser:
      update.assigneeUser === null
        ? undefined
        : (mergeUser(
            current.assigneeUser,
            merged.assigneeUser,
            keepAddresses,
          ) ?? undefined),
    createdByUser:
      mergeUser(current.createdByUser, merged.createdByUser, keepAddresses) ??
      undefined,
  };
}
