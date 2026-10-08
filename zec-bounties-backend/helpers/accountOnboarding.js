const SELF_SERVE_ROLES = new Set(["HUNTER", "TEAM"]);

class AccountOnboardingError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AccountOnboardingError";
    this.statusCode = statusCode;
  }
}

const ROLE_CHANGE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatar: true,
  nickname: true,
  isRobin: true,
  isManOfSteel: true,
  z_address: true,
  UA_address: true,
  emailNotifications: true,
};

async function changeSelfServeRole(
  prisma,
  { userId, currentRole, targetRole, isRobin = false },
) {
  if (!SELF_SERVE_ROLES.has(targetRole)) {
    throw new AccountOnboardingError(400, "Role must be HUNTER or TEAM");
  }
  if (!SELF_SERVE_ROLES.has(currentRole) || isRobin) {
    throw new AccountOnboardingError(
      403,
      "This account cannot change its role here",
    );
  }

  return prisma.$transaction(async (tx) => {
    const account = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!account) {
      throw new AccountOnboardingError(404, "User not found");
    }
    if (account.role !== currentRole) {
      throw new AccountOnboardingError(
        409,
        "Your account role changed. Refresh and try again.",
      );
    }
    if (account.role === targetRole) {
      return tx.user.findUnique({
        where: { id: userId },
        select: ROLE_CHANGE_USER_SELECT,
      });
    }

    if (account.role === "TEAM" && targetRole === "HUNTER") {
      const managedTeam = await tx.teamMember.findFirst({
        where: { userId, role: { in: ["OWNER", "ADMIN"] } },
        select: { teamId: true },
      });
      if (managedTeam) {
        throw new AccountOnboardingError(
          409,
          "Transfer team ownership or remove your team admin role before switching to Hunter.",
        );
      }
    }

    const changed = await tx.user.updateMany({
      where: { id: userId, role: currentRole },
      data: { role: targetRole },
    });
    if (changed.count !== 1) {
      throw new AccountOnboardingError(
        409,
        "Your account role changed. Refresh and try again.",
      );
    }

    return tx.user.findUnique({
      where: { id: userId },
      select: ROLE_CHANGE_USER_SELECT,
    });
  });
}

async function findOrCreateGoogleUser(prisma, profile) {
  const googleId = typeof profile?.sub === "string" ? profile.sub : "";
  const email =
    typeof profile?.email === "string" ? profile.email.trim().toLowerCase() : "";
  if (!googleId || !email || profile.email_verified !== true) {
    throw new AccountOnboardingError(
      400,
      "Google did not provide a verified email address.",
    );
  }

  const linkedUser = await prisma.user.findUnique({
    where: { googleId },
  });
  if (linkedUser) return linkedUser;

  const emailUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (emailUser) {
    if (emailUser.googleId && emailUser.googleId !== googleId) {
      throw new AccountOnboardingError(
        409,
        "This email is already linked to a different Google account.",
      );
    }
    return prisma.user.update({
      where: { id: emailUser.id },
      data: {
        googleId,
        ...(!emailUser.avatar && profile.picture
          ? { avatar: profile.picture }
          : {}),
      },
    });
  }

  return prisma.user.create({
    data: {
      name: profile.name || email.split("@")[0],
      email,
      googleId,
      avatar: profile.picture || null,
      role: "CLIENT",
    },
  });
}

module.exports = {
  AccountOnboardingError,
  changeSelfServeRole,
  findOrCreateGoogleUser,
};
