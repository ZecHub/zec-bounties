const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AccountOnboardingError,
  findOrCreateGoogleUser,
} = require("../helpers/accountOnboarding");

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
