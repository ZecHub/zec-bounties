const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  analyzeBountySuggestion,
  createBountySuggestionCheck,
  verifyBountySuggestionCheck,
} = require("../helpers/bountySuggestionCheck");

const rate = 100;

describe("analyzeBountySuggestion", () => {
  it("returns similarity scores and flags a duplicate", () => {
    const result = analyzeBountySuggestion({
      title: "Add shielded address validation",
      description:
        "Done when invalid shielded addresses are rejected and valid Zcash addresses pass.",
      bountyAmount: 1,
      zecUsd: rate,
      existingBounties: [
        {
          id: "existing-1",
          title: "Add shielded address validation",
          description:
            "Done when invalid shielded addresses are rejected and valid Zcash addresses pass.",
        },
      ],
    });

    assert.equal(result.similarBounties[0].id, "existing-1");
    assert.equal(result.similarBounties[0].similarity, 100);
    assert.ok(result.flags.some((flag) => flag.code === "similar_bounties"));
  });

  it("flags a reward outside the inferred USD band", () => {
    const result = analyzeBountySuggestion({
      title: "Build a large multi-file Zcash feature",
      description:
        "Done when the large feature has tests and a migration guide.",
      bountyAmount: 0.5,
      zecUsd: rate,
    });

    const priceFlag = result.flags.find(
      (flag) => flag.code === "price_outside_band",
    );
    assert.ok(priceFlag);
    assert.match(priceFlag.message, /\$50\.00/);
    assert.match(priceFlag.message, /\$250/);
    assert.equal(result.estimatedBand, "XL");
  });

  it("returns no flags for a clear, relevant suggestion with a fair reward", () => {
    const result = analyzeBountySuggestion({
      title: "Fix a small Zcash wallet validation bug",
      description:
        "Done when invalid Zcash wallet addresses show a clear error and valid addresses still pass.",
      bountyAmount: 0.4,
      zecUsd: rate,
    });

    assert.deepEqual(result.flags, []);
    assert.deepEqual(result.similarBounties, []);
    assert.equal(result.estimatedUsd, 40);
    assert.equal(result.adviceOnly, true);
  });
});

describe("createBountySuggestionCheck", () => {
  it("sends every bounty and its full text to AI and does not expose matched details", async () => {
    const allBounties = Array.from({ length: 40 }, (_, index) => ({
      id: `bounty-${index}`,
      title:
        index === 39
          ? "Add shielded address validation"
          : `Unrelated Zcash task ${index}`,
      description:
        index === 39
          ? "Done when invalid shielded addresses are rejected."
          : `A different Zcash task with unique subject ${index}.`,
      status: index === 39 ? "DONE" : ["TO_DO", "IN_PROGRESS", "IN_REVIEW", "CANCELLED"][index % 4],
      isPrivate: index === 39,
    }));
    let findManyArgs;
    let providerCalls = 0;
    const prisma = {
      bounty: {
        findMany: async (args) => {
          findManyArgs = args;
          return allBounties;
        },
      },
    };
    const validReview = {
      zcashRelevant: true,
      zcashReason: "The task improves Zcash addresses.",
      hasAcceptanceCriteria: true,
      criteriaReason: "It states an observable completion condition.",
      workBand: "S",
      workBandReason: "Compared against Add shielded address validation.",
      confidence: 0.9,
      similarBounties: [
        {
          id: "candidate-40",
          similarity: 94,
          reason: "Both tasks validate shielded addresses.",
        },
      ],
    };
    const fetchImpl = async (url, request) => {
      providerCalls += 1;
      if (String(url).includes("openai.com")) {
        assert.match(request.headers.authorization, /^Bearer /);
        return { ok: false, status: 503 };
      }
      assert.match(String(url), /anthropic\.com/);
      const anthropicRequest = JSON.parse(request.body);
      const prompt = anthropicRequest.messages[0].content;
      const { allExistingBounties } = JSON.parse(prompt);
      assert.equal(allExistingBounties.length, allBounties.length);
      assert.ok(allExistingBounties.some((bounty) => bounty.status === "IN_REVIEW"));
      assert.ok(allExistingBounties.some((bounty) => bounty.status === "CANCELLED"));
      assert.ok(allExistingBounties.some((bounty) => bounty.isPrivate));
      assert.ok(allExistingBounties.some((bounty) => bounty.title === "Unrelated Zcash task 0"));
      assert.ok(
        allExistingBounties.some(
          (bounty) =>
            bounty.title === "Add shielded address validation" &&
            bounty.description === "Done when invalid shielded addresses are rejected.",
        ),
      );
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ type: "text", text: JSON.stringify(validReview) }],
        }),
      };
    };
    const input = {
      userId: "hunter-1",
      title: "Add shielded address validation",
      description: "Done when invalid shielded addresses are rejected.",
      bountyAmount: 0.4,
    };

    const check = await createBountySuggestionCheck(prisma, input, {
      env: {
        JWT_SECRET: "test-secret",
        OPENAI_API_KEY: "openai-test-key",
        ANTHROPIC_API_KEY: "anthropic-test-key",
        GEMINI_API_KEY: "gemini-test-key",
      },
      fetchImpl,
      zecUsd: 100,
    });

    assert.equal(findManyArgs.where, undefined);
    assert.equal(providerCalls, 2);
    assert.equal(check.result.aiReview.provider, "anthropic");
    assert.deepEqual(check.result.similarBounties[0], {
      stage: "completed",
      similarity: 94,
    });
    assert.equal(JSON.stringify(check.result).includes("bounty-29"), false);
    assert.equal(
      JSON.stringify(check.result).includes(
        "Done when invalid shielded addresses are rejected.",
      ),
      false,
    );
    assert.equal(
      JSON.stringify(check.result).includes("shielded address validation"),
      false,
    );
    assert.equal(
      verifyBountySuggestionCheck(
        check.verificationToken,
        "hunter-1",
        input,
        "test-secret",
      ).aiReview.provider,
      "anthropic",
    );
    assert.equal(
      verifyBountySuggestionCheck(
        check.verificationToken,
        "another-user",
        input,
        "test-secret",
      ),
      null,
    );
    assert.equal(
      verifyBountySuggestionCheck(
        check.verificationToken,
        "hunter-1",
        { ...input, bountyAmount: 5 },
        "test-secret",
      ),
      null,
    );
  });

  it("keeps local checks when no AI provider is configured", async () => {
    const check = await createBountySuggestionCheck(
      { bounty: { findMany: async () => [] } },
      {
        userId: "hunter-1",
        title: "A clear Zcash task",
        description: "Done when the Zcash task is complete.",
        bountyAmount: 0.4,
      },
      { env: { JWT_SECRET: "test-secret" }, zecUsd: 100 },
    );

    assert.equal(check.result.aiReview.status, "not_configured");
    assert.ok(check.result.flags.some((flag) => flag.code === "ai_unavailable"));
    assert.equal(check.result.adviceOnly, true);
  });

  it("uses Gemini when the earlier providers are unavailable", async () => {
    let requestedUrl;
    const check = await createBountySuggestionCheck(
      { bounty: { findMany: async () => [] } },
      {
        userId: "hunter-1",
        title: "A Zcash task",
        description: "Done when the Zcash change passes its tests.",
        bountyAmount: 0.4,
      },
      {
        env: { JWT_SECRET: "test-secret", GEMINI_API_KEY: "gemini-test-key" },
        zecUsd: 100,
        fetchImpl: async (url) => {
          requestedUrl = String(url);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          zcashRelevant: true,
                          zcashReason: "The bounty directly concerns Zcash.",
                          hasAcceptanceCriteria: true,
                          criteriaReason: "It states a testable result.",
                          workBand: "S",
                          workBandReason: "This is a small change.",
                          confidence: 0.85,
                          similarBounties: [],
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
          };
        },
      },
    );

    assert.match(requestedUrl, /gemini-2\.5-flash:generateContent/);
    assert.match(requestedUrl, /key=gemini-test-key/);
    assert.equal(check.result.aiReview.provider, "gemini");
    assert.equal(check.result.aiReview.status, "completed");
  });
});
