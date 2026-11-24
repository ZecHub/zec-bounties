const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const sendMailPath = require.resolve("../utils/sendMail.js");
const mailerPath = require.resolve("../utils/mailer.js");

function loadSendMailWithStub(sendImpl) {
  const prevSendMail = require.cache[sendMailPath];
  const prevMailer = require.cache[mailerPath];
  const calls = [];

  delete require.cache[sendMailPath];
  require.cache[mailerPath] = {
    id: mailerPath,
    filename: mailerPath,
    loaded: true,
    exports: {
      sendMail: async (payload) => {
        calls.push(payload);
        return sendImpl ? sendImpl(payload) : { response: "250 OK" };
      },
    },
  };

  const sendMail = require(sendMailPath);

  return {
    sendMail,
    calls,
    restore() {
      delete require.cache[sendMailPath];
      if (prevSendMail) require.cache[sendMailPath] = prevSendMail;
      if (prevMailer) {
        require.cache[mailerPath] = prevMailer;
      } else {
        delete require.cache[mailerPath];
      }
    },
  };
}

describe("utils/sendMail", () => {
  it("evaluates NODE_ENV dynamically and applies DEV_EMAIL_FALLBACK outside production", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevFallback = process.env.DEV_EMAIL_FALLBACK;
    const prevSmtpUser = process.env.SMTP_USER;
    const { sendMail, calls, restore } = loadSendMailWithStub();

    try {
      process.env.SMTP_USER = "alerts@example.com";
      process.env.NODE_ENV = "development";
      process.env.DEV_EMAIL_FALLBACK = "dev@example.com";

      await sendMail({
        to: "user@example.com",
        subject: "Bounty approved",
        text: "Approved",
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0].to, "dev@example.com");
      assert.equal(calls[0].subject, "[DEV] Bounty approved");

      process.env.NODE_ENV = "production";
      await sendMail({
        to: "user@example.com",
        subject: "Bounty approved",
        text: "Approved",
      });

      assert.equal(calls.length, 2);
      assert.equal(calls[1].to, "user@example.com");
      assert.equal(calls[1].subject, "Bounty approved");
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevFallback === undefined) delete process.env.DEV_EMAIL_FALLBACK;
      else process.env.DEV_EMAIL_FALLBACK = prevFallback;
      if (prevSmtpUser === undefined) delete process.env.SMTP_USER;
      else process.env.SMTP_USER = prevSmtpUser;
      restore();
    }
  });

  it("returns null without invoking SMTP when recipient is missing or blank", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevFallback = process.env.DEV_EMAIL_FALLBACK;
    const { sendMail, calls, restore } = loadSendMailWithStub();

    try {
      process.env.NODE_ENV = "production";
      delete process.env.DEV_EMAIL_FALLBACK;

      assert.equal(await sendMail(), null);
      assert.equal(await sendMail({ to: "   ", subject: "Empty" }), null);
      assert.equal(await sendMail({ to: ["", "  "], subject: "Empty" }), null);
      assert.equal(calls.length, 0);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevFallback === undefined) delete process.env.DEV_EMAIL_FALLBACK;
      else process.env.DEV_EMAIL_FALLBACK = prevFallback;
      restore();
    }
  });

  it("strips CR/LF from headers and handles missing subject cleanly", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevFallback = process.env.DEV_EMAIL_FALLBACK;
    const { sendMail, calls, restore } = loadSendMailWithStub();

    try {
      process.env.NODE_ENV = "development";
      delete process.env.DEV_EMAIL_FALLBACK;

      await sendMail({
        to: "alice@example.com\r\nBcc: evil@example.com",
        subject: "Hello\r\nX-Injected: 1",
        text: "Body",
      });
      assert.equal(calls[0].to, "alice@example.com Bcc: evil@example.com");
      assert.equal(calls[0].subject, "[DEV] Hello X-Injected: 1");

      await sendMail({
        to: [" bob@example.com ", ""],
        subject: undefined,
        text: "Body",
      });
      assert.deepEqual(calls[1].to, ["bob@example.com"]);
      assert.equal(calls[1].subject, "[DEV]");
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevFallback === undefined) delete process.env.DEV_EMAIL_FALLBACK;
      else process.env.DEV_EMAIL_FALLBACK = prevFallback;
      restore();
    }
  });

  it("does not throw when transporter resolves without an info object", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const { sendMail, restore } = loadSendMailWithStub(async () => undefined);

    try {
      process.env.NODE_ENV = "production";
      const res = await sendMail({
        to: "user@example.com",
        subject: "Test",
        text: "Hi",
      });
      assert.equal(res, undefined);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      restore();
    }
  });
});
