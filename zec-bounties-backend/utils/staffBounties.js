const STAFF_OPEN_STATUSES = ["TO_DO", "IN_PROGRESS", "IN_REVIEW"];
const STAFF_PAGE_LIMIT = 100;
const FORBIDDEN_STAFF_KEYS = [
  "email",
  "z_address",
  "UA_address",
  "githubId",
  "password",
  "description",
];

const STAFF_USER_SELECT = {
  id: true,
  name: true,
  nickname: true,
  createdAt: true,
};

// Bounty columns the staff view reads; keep in step with staffBountyRow.
const STAFF_BOUNTY_SELECT = {
  id: true,
  title: true,
  status: true,
  chain: true,
  bountyAmount: true,
  isPrivate: true,
  isPaid: true,
  isApproved: true,
  dateCreated: true,
  completedAt: true,
  paidAt: true,
  exportedAt: true,
  team: { select: { name: true } },
};

function staffBountyRow(bounty, relation, applicationStatus) {
  return {
    id: bounty.id,
    title: bounty.title,
    status: bounty.status,
    chain: bounty.chain,
    bountyAmount: bounty.bountyAmount,
    isPrivate: bounty.isPrivate,
    isPaid: bounty.isPaid,
    isApproved: bounty.isApproved,
    exportedAt: bounty.exportedAt || null,
    dateCreated: bounty.dateCreated,
    completedAt: bounty.completedAt,
    paidAt: bounty.paidAt,
    teamName: bounty.team?.name || null,
    relations: [relation],
    applicationStatus: applicationStatus || null,
  };
}

function mergeStaffRow(map, row) {
  const existing = map.get(row.id);
  if (!existing) {
    map.set(row.id, row);
    return;
  }
  for (const relation of row.relations) {
    if (!existing.relations.includes(relation))
      existing.relations.push(relation);
  }
  if (row.applicationStatus) existing.applicationStatus = row.applicationStatus;
}

function pageStaffRows(rows, offset, limit = STAFF_PAGE_LIMIT) {
  const start = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const size = STAFF_PAGE_LIMIT;
  const slice = rows.slice(start, start + size);
  const next = start + slice.length < rows.length ? start + slice.length : null;
  return { rows: slice, nextOffset: next, total: rows.length, limit: size };
}

// Resolves a profile key in a fixed order: id, then the unique nickname, then
// a display name only when exactly one user has it. The public profile route
// passes its own select.
async function resolveStaffUser(prisma, key, select = STAFF_USER_SELECT) {
  const byId = await prisma.user.findUnique({
    where: { id: key },
    select,
  });
  if (byId) return { user: byId };

  const byNickname = await prisma.user.findUnique({
    where: { nickname: key },
    select,
  });
  if (byNickname) return { user: byNickname };

  const byName = await prisma.user.findMany({
    where: { name: key },
    select,
    take: 2,
  });
  if (byName.length === 1) return { user: byName[0] };
  if (byName.length > 1) {
    return {
      status: 409,
      error: "Multiple users share that name. Open the profile by id.",
    };
  }
  return { status: 404, error: "User not found" };
}

function buildStaffView(
  user,
  chain,
  created,
  assigned,
  viaJoin,
  applications,
  offsets,
) {
  const map = new Map();
  for (const bounty of created)
    mergeStaffRow(map, staffBountyRow(bounty, "created"));
  for (const bounty of assigned)
    mergeStaffRow(map, staffBountyRow(bounty, "assigned"));
  for (const bounty of viaJoin)
    mergeStaffRow(map, staffBountyRow(bounty, "assigned"));
  for (const app of applications) {
    if (!app.bounty) continue;
    mergeStaffRow(map, staffBountyRow(app.bounty, "applied", app.status));
  }

  const open = [];
  const history = [];
  for (const row of map.values()) {
    if (STAFF_OPEN_STATUSES.includes(row.status)) open.push(row);
    else history.push(row);
  }
  // Prisma hands these over as Date objects; String(date) starts with the
  // weekday name, so compare timestamps.
  const recency = (row) => {
    const time = new Date(
      row.completedAt || row.paidAt || row.dateCreated || 0,
    ).getTime();
    return Number.isNaN(time) ? 0 : time;
  };
  const byRecent = (a, b) => recency(b) - recency(a);
  open.sort(byRecent);
  history.sort(byRecent);

  const openPage = pageStaffRows(open, offsets.openOffset);
  const historyPage = pageStaffRows(history, offsets.historyOffset);
  const all = [...open, ...history];
  const statusCounts = {
    TO_DO: 0,
    IN_PROGRESS: 0,
    IN_REVIEW: 0,
    DONE: 0,
    CANCELLED: 0,
  };
  let zecEarned = 0;
  for (const row of all) {
    if (statusCounts[row.status] != null) statusCounts[row.status] += 1;
    if (
      row.status === "DONE" &&
      (row.isPaid || row.exportedAt) &&
      row.relations.includes("assigned")
    ) {
      zecEarned += Number(row.bountyAmount) || 0;
    }
  }
  return {
    userId: user.id,
    displayName: user.nickname || user.name,
    joinedAt: user.createdAt,
    chain,
    limit: STAFF_PAGE_LIMIT,
    bountyCount: all.length,
    zecEarned,
    statusCounts,
    open: openPage.rows,
    openTotal: openPage.total,
    openNextOffset: openPage.nextOffset,
    history: historyPage.rows,
    historyTotal: historyPage.total,
    historyNextOffset: historyPage.nextOffset,
  };
}

module.exports = {
  STAFF_OPEN_STATUSES,
  STAFF_PAGE_LIMIT,
  FORBIDDEN_STAFF_KEYS,
  STAFF_USER_SELECT,
  STAFF_BOUNTY_SELECT,
  staffBountyRow,
  resolveStaffUser,
  buildStaffView,
};
