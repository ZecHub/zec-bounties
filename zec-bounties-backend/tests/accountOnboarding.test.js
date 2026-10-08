const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AccountOnboardingError,
  changeSelfServeRole,
  findOrCreateGoogleUser,
} = require("../helpers/accountOnboarding");

function mockRolePrisma(user, managedTeam = null) {
  return {
    $transaction: async (callback) =>
      callback({
        user: {
          findUnique: async () => ({ ...user }),
          updateMany: async ({ where, data }) => {
            if (user.role !== where.role) return { count: 0 };
            user.role = data.role;
            return { count: 1 };
          },
        },
        teamMember: {
          findFirst: async () => managedTeam,
        },
      }),
  };
}

test("hunter can switch to team without losing account history", async () => {
  const user = { id: "hunter-1", role: "HUNTER", email: "hunter@example.com" };
  const updated = await changeSelfServeRole(mockRolePrisma(user), {
    userId: user.id,
    currentRole: "HUNTER",
    targetRole: "TEAM",
  });

  assert.equal(updated.role, "TEAM");
  assert.equal(user.email, "hunter@example.com");
});

test("team member can switch to hunter when they do not manage a team", async () => {
  const user = { id: "team-member", role: "TEAM" };
  const updated = await changeSelfServeRole(mockRolePrisma(user), {
    userId: user.id,
    currentRole: "TEAM",
    targetRole: "HUNTER",
  });

  assert.equal(updated.role, "HUNTER");
});

test("team owners and admins must transfer responsibilities before switching", async () => {
  const user = { id: "team-owner", role: "TEAM" };
  await assert.rejects(
    changeSelfServeRole(
      mockRolePrisma(user, { teamId: "team-1" }),
      {
        userId: user.id,
        currentRole: "TEAM",
        targetRole: "HUNTER",
      },
    ),
    (error) =>
      error instanceof AccountOnboardingError &&
      error.statusCode === 409 &&
      /Transfer team ownership/.test(error.message),
  );
  assert.equal(user.role, "TEAM");
});

test("initial, admin, and simulated admin roles cannot use role conversion", async () => {
  for (const input of [
    { currentRole: "CLIENT", targetRole: "TEAM" },
    { currentRole: "ADMIN", targetRole: "HUNTER" },
    { currentRole: "TEAM", targetRole: "HUNTER", isRobin: true },
  ]) {
    await assert.rejects(
      changeSelfServeRole(mockRolePrisma({ id: "user", role: input.currentRole }), {
        userId: "user",
        ...input,
      }),
      AccountOnboardingError,
    );
  }
});

test("Google sign-in creates new users only from verified email profiles", async () => {
  let createdUser;
  const googleUser = await findOrCreateGoogleUser(
    {
      user: {
        findUnique: async () => null,
        findFirst: async ({ where }) => {
          assert.equal(where.email.equals, "writer@example.com");
          assert.equal(where.email.mode, "insensitive");
          return null;
        },
        create: async ({ data }) => {
          createdUser = data;
          return { id: "new-user", ...data };
        },
      },
    },
    {
      sub: "google-sub-1",
      email: "Writer@Example.com",
      email_verified: true,
      name: "Writer Name",
      picture: "https://example.com/avatar.png",
    },
  );

  assert.equal(googleUser.role, "CLIENT");
  assert.equal(createdUser.email, "writer@example.com");
  assert.equal(createdUser.googleId, "google-sub-1");
});

test("Google sign-in links a verified email to its existing account", async () => {
  let linked;
  const user = {
    id: "existing-user",
    email: "member@example.com",
    googleId: null,
    avatar: null,
  };
  const result = await findOrCreateGoogleUser(
    {
      user: {
        findUnique: async () => null,
        findFirst: async () => user,
        update: async ({ data }) => {
          linked = data.googleId;
          return { ...user, ...data };
        },
      },
    },
    {
      sub: "google-sub-2",
      email: "MEMBER@example.com",
      email_verified: true,
    },
  );

  assert.equal(linked, "google-sub-2");
  assert.equal(result.id, "existing-user");
});

test("Google sign-in refuses unverified email addresses", async () => {
  await assert.rejects(
    findOrCreateGoogleUser({ user: {} }, {
      sub: "google-sub-3",
      email: "unverified@example.com",
      email_verified: false,
    }),
    AccountOnboardingError,
  );
});

test("Google sign-in rejects a verified email linked to another Google identity", async () => {
  await assert.rejects(
    findOrCreateGoogleUser(
      {
        user: {
          findUnique: async () => null,
          findFirst: async () => ({
            id: "existing-user",
            googleId: "different-google-sub",
          }),
        },
      },
      {
        sub: "google-sub-4",
        email: "member@example.com",
        email_verified: true,
      },
    ),
    (error) =>
      error instanceof AccountOnboardingError &&
      error.statusCode === 409,
  );
});
