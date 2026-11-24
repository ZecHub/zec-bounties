const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadPinataWithMock(sdkCalls) {
  const targetPath = require.resolve("../utils/ipfs/pinata");
  delete require.cache[targetPath];

  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "pinata") {
      return {
        PinataSDK: class MockPinataSDK {
          constructor(opts) {
            this.opts = opts;
            sdkCalls.constructedWith.push(opts);
            this.upload = {
              public: {
                file: async (file) => {
                  sdkCalls.uploaded.push({ jwt: opts.pinataJwt, file });
                  return { cid: "bafy-test-cid" };
                },
              },
            };
          }
        },
      };
    }
    return origLoad.apply(this, arguments);
  };

  try {
    return require(targetPath);
  } finally {
    Module._load = origLoad;
  }
}

test("pinataUrl normalizes gateway scheme/slashes and CID prefixes", () => {
  const calls = { constructedWith: [], uploaded: [] };
  const prevGateway = process.env.PINATA_GATEWAY;
  const { pinataUrl } = loadPinataWithMock(calls);

  try {
    delete process.env.PINATA_GATEWAY;
    assert.equal(pinataUrl(null), null);
    assert.equal(pinataUrl("   "), null);
    assert.equal(
      pinataUrl("bafy123"),
      "https://gateway.pinata.cloud/ipfs/bafy123",
    );
    assert.equal(
      pinataUrl("  ipfs://bafy123  "),
      "https://gateway.pinata.cloud/ipfs/bafy123",
    );
    assert.equal(
      pinataUrl("/ipfs/bafy123"),
      "https://gateway.pinata.cloud/ipfs/bafy123",
    );

    process.env.PINATA_GATEWAY = "https://team.mypinata.cloud/";
    assert.equal(
      pinataUrl("bafy456"),
      "https://team.mypinata.cloud/ipfs/bafy456",
    );

    process.env.PINATA_GATEWAY = "  https://team.mypinata.cloud/ipfs/  ";
    assert.equal(
      pinataUrl("bafy789"),
      "https://team.mypinata.cloud/ipfs/bafy789",
    );
  } finally {
    if (prevGateway === undefined) delete process.env.PINATA_GATEWAY;
    else process.env.PINATA_GATEWAY = prevGateway;
  }
});

test("uploadToPinata initializes SDK lazily and picks up updated PINATA_JWT", async () => {
  const calls = { constructedWith: [], uploaded: [] };
  const prevJwt = process.env.PINATA_JWT;
  delete process.env.PINATA_JWT;

  const { uploadToPinata } = loadPinataWithMock(calls);
  assert.equal(calls.constructedWith.length, 0);

  try {
    await assert.rejects(
      () => uploadToPinata({ buffer: Buffer.from("hi"), originalname: "a.png", mimetype: "image/png" }),
      /PINATA_JWT is not configured/,
    );

    process.env.PINATA_JWT = "jwt-v1";
    const res1 = await uploadToPinata({
      buffer: Buffer.from("img1"),
      originalname: "logo.png",
      mimetype: "image/png",
    });
    assert.deepEqual(res1, { cid: "bafy-test-cid" });
    assert.equal(calls.uploaded[0].jwt, "jwt-v1");

    process.env.PINATA_JWT = "jwt-v2";
    await uploadToPinata({
      buffer: Buffer.from("img2"),
      originalname: "banner.png",
      mimetype: "image/png",
    });
    assert.equal(calls.uploaded[1].jwt, "jwt-v2");
    assert.equal(calls.constructedWith.length, 2);
  } finally {
    if (prevJwt === undefined) delete process.env.PINATA_JWT;
    else process.env.PINATA_JWT = prevJwt;
  }
});
