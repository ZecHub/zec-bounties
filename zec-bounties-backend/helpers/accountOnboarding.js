class AccountOnboardingError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AccountOnboardingError";
    this.statusCode = statusCode;
  }
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
  findOrCreateGoogleUser,
};
