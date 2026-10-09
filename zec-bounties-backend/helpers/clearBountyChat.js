async function clearBountyChat(tx, bountyId) {
  const [bounty, admins] = await Promise.all([
    tx.bounty.findUnique({
      where: { id: bountyId },
      select: {
        assignee: true,
        assignees: { select: { userId: true } },
      },
    }),
    tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
  ]);

  if (!bounty) return [];

  await tx.bountyChat.deleteMany({ where: { bountyId } });
  await tx.inAppNotification.deleteMany({
    where: { bountyId, type: "BOUNTY_CHAT" },
  });

  return [
    ...new Set(
      [
        bounty.assignee,
        ...bounty.assignees.map((assignee) => assignee.userId),
        ...admins.map((admin) => admin.id),
      ].filter(Boolean),
    ),
  ];
}

function isTransitionToDone(previousStatus, nextStatus) {
  return previousStatus !== "DONE" && nextStatus === "DONE";
}

module.exports = { clearBountyChat, isTransitionToDone };
