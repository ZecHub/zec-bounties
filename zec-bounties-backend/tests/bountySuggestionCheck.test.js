const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_CANDIDATES,
  analyzeBountySuggestion,
  createBountySuggestionCheck,
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
  it("only sends public bounties to AI, capped at the candidate limit, and hides matches", async () => {
    const publicBounties = Array.from({ length: 30 }, (_, index) => ({
      id: `public-${index}`,
      title:
        index === 29
          ? "Add shielded address validation"
          : `Unrelated Zcash task ${index}`,
      description:
        index === 29
          ? "Done when invalid shielded addresses are rejected."
          : `A different Zcash task with unique subject ${index}.`,
      status:
        index === 29
          ? "DONE"
          : ["TO_DO", "IN_PROGRESS", "IN_REVIEW", "CANCELLED"][index % 4],
      isPrivate: false,
    }));
    const privateBounties = [
      {
        id: "private-1",
        title: "Internal Zcash treasury task",
        description: "PRIVATE SECRET DESCRIPTION",
        status: "DONE",
        isPrivate: true,
      },
    ];
    const allBounties = [...publicBounties, ...privateBounties];

    let findManyArgs;
    let providerCalls = 0;
    const prisma = {
      bounty: {
        findMany: async (args) => {
          findManyArgs = args;
          let rows = allBounties.filter((bounty) =>
            args.where?.isPrivate === false ? !bounty.isPrivate : true,
          );
          if (args.take) rows = rows.slice(0, args.take);
          return rows;
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
          id: "candidate-30",
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
      assert.equal(allExistingBounties.length, publicBounties.length);
      assert.ok(allExistingBounties.some((bounty) => bounty.status === "IN_REVIEW"));
      assert.ok(allExistingBounties.some((bounty) => bounty.status === "CANCELLED"));
      assert.ok(
        allExistingBounties.every(
          (bounty) => !Object.prototype.hasOwnProperty.call(bounty, "isPrivate"),
        ),
      );
      assert.ok(
        !allExistingBounties.some(
          (bounty) => bounty.title === "Internal Zcash treasury task",
        ),
      );
      assert.equal(prompt.includes("PRIVATE SECRET DESCRIPTION"), false);
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
        OPENAI_API_KEY: "openai-test-key",
        ANTHROPIC_API_KEY: "anthropic-test-key",
        GEMINI_API_KEY: "gemini-test-key",
      },
      fetchImpl,
      zecUsd: 100,
    });

    assert.deepEqual(findManyArgs.where, { isPrivate: false });
    assert.equal(findManyArgs.take, MAX_CANDIDATES);
    assert.equal(providerCalls, 2);
    assert.equal(check.aiReview.provider, "anthropic");
    assert.deepEqual(check.similarBounties[0], {
      stage: "completed",
      similarity: 94,
    });
    assert.equal(JSON.stringify(check).includes("public-28"), false);
    assert.equal(
      JSON.stringify(check).includes(
        "Done when invalid shielded addresses are rejected.",
      ),
      false,
    );
    assert.equal(
      JSON.stringify(check).includes("shielded address validation"),
      false,
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
      { env: {}, zecUsd: 100 },
    );

    assert.equal(check.aiReview.status, "not_configured");
    assert.ok(check.flags.some((flag) => flag.code === "ai_unavailable"));
    assert.equal(check.adviceOnly, true);
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
        env: { GEMINI_API_KEY: "gemini-test-key" },
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
    assert.equal(check.aiReview.provider, "gemini");
    assert.equal(check.aiReview.status, "completed");
  });
});
