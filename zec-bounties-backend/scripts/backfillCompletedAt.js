function toValidDate(value) {
  if (value === null || value === undefined || typeof value === "boolean") {
    return null;
  }
  if (typeof value === "string" && !value.trim()) {
    return null;
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function resolveCompletedAt(bounty) {
  if (!bounty || typeof bounty !== "object") {
    return { estimate: null, source: null };
  }

  const paidAt = toValidDate(bounty.paidAt);
  if (paidAt) {
    return { estimate: paidAt, source: "paidAt" };
  }

  const submissions = Array.isArray(bounty.workSubmissions)
    ? bounty.workSubmissions
    : [];
  let latestReviewedAt = null;
  for (const submission of submissions) {
    if (!submission || submission.status !== "approved") continue;
    const reviewedAt = toValidDate(submission.reviewedAt);
    if (reviewedAt && (!latestReviewedAt || reviewedAt.getTime() > latestReviewedAt.getTime())) {
      latestReviewedAt = reviewedAt;
    }
  }

  if (latestReviewedAt) {
    return { estimate: latestReviewedAt, source: "reviewedAt" };
  }

  return { estimate: null, source: null };
}

async function main(prismaClient) {
  const ownsClient = !prismaClient;
  const prisma =
    prismaClient || new (require("@prisma/client").PrismaClient)();

  try {
    const bounties = await prisma.bounty.findMany({
      where: {
        status: "DONE",
        completedAt: null, // only backfill what's missing — safe to re-run
      },
      select: {
        id: true,
        paidAt: true,
        workSubmissions: {
          select: { status: true, reviewedAt: true },
        },
      },
    });

    console.log(`Found ${bounties.length} DONE bounties missing completedAt`);

    let fromPaidAt = 0;
    let fromReviewedAt = 0;
    let unresolved = 0;

    for (const bounty of bounties) {
      const { estimate, source } = resolveCompletedAt(bounty);

      if (!estimate) {
        unresolved++;
        console.warn(`No signal for bounty ${bounty.id} — left completedAt null`);
        continue;
      }

      await prisma.bounty.update({
        where: { id: bounty.id },
        data: { completedAt: estimate },
      });

      if (source === "paidAt") fromPaidAt++;
      else fromReviewedAt++;
    }

    console.log(
      `Done. paidAt: ${fromPaidAt}, reviewedAt: ${fromReviewedAt}, unresolved: ${unresolved}`,
    );

    return { fromPaidAt, fromReviewedAt, unresolved };
  } finally {
    if (ownsClient) {
      await prisma.$disconnect();
    }
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { toValidDate, resolveCompletedAt, main };
