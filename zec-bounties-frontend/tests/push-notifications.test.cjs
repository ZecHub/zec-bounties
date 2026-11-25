const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadPushNotifications(env = {}) {
  const filename = path.resolve(__dirname, "..", "lib/pushNotifications.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mod = { exports: {} };
  const customRequire = (specifier) => {
    if (specifier === "./configENV") {
      return { backendUrl: "https://api.example.test" };
    }
    throw new Error(`Unexpected require: ${specifier}`);
  };
  vm.runInNewContext(
    compiled.outputText,
    {
      module: mod,
      exports: mod.exports,
      require: customRequire,
      process: { env: env.processEnv || {} },
      navigator: env.navigator,
      window: env.window,
      Notification: env.Notification,
      localStorage: env.localStorage,
      fetch: env.fetch,
      Uint8Array,
      atob,
      globalThis: { atob },
    },
    { filename },
  );
  return mod.exports;
}

test("urlBase64ToUint8Array trims whitespace, decodes base64url, and rejects invalid inputs", () => {
  const { urlBase64ToUint8Array } = loadPushNotifications();
  const decoded = urlBase64ToUint8Array("  -__-  ");
  assert.deepEqual(Array.from(decoded), [0xfb, 0xff, 0xfe]);

  assert.throws(() => urlBase64ToUint8Array(""), /empty/i);
  assert.throws(() => urlBase64ToUint8Array("   "), /empty/i);
  assert.throws(() => urlBase64ToUint8Array(null), /must be a string/i);
});

test("subscribeToPush guards missing Notification API and surfaces server error details", async () => {
  const noNotification = loadPushNotifications({
    navigator: { serviceWorker: {} },
    window: { PushManager: {} },
    Notification: undefined,
  });
  await assert.rejects(
    () => noNotification.subscribeToPush(),
    /Notifications are not supported/i,
  );

  const sub = { toJSON: () => ({ endpoint: "https://push.example/1" }) };
  const failingServer = loadPushNotifications({
    processEnv: { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "-__-" },
    navigator: {
      serviceWorker: {
        register: async () => {},
        ready: Promise.resolve({
          pushManager: { getSubscription: async () => sub },
        }),
      },
    },
    window: { PushManager: {} },
    Notification: { requestPermission: async () => "granted" },
    localStorage: { getItem: () => "tok" },
    fetch: async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "Subscription store unavailable" }),
    }),
  });
  await assert.rejects(
    () => failingServer.subscribeToPush(),
    /Subscription store unavailable/,
  );
});

test("unsubscribeFromPush exits cleanly without serviceWorker and throws on failed server unregister", async () => {
  const unsupported = loadPushNotifications({ navigator: {} });
  assert.equal(await unsupported.unsubscribeFromPush(), undefined);

  let unsubscribed = false;
  const failingUnregister = loadPushNotifications({
    navigator: {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => ({
              endpoint: "https://push.example/1",
              unsubscribe: async () => {
                unsubscribed = true;
                return true;
              },
            }),
          },
        }),
      },
    },
    localStorage: { getItem: () => "tok" },
    fetch: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: "Push unregister failed" }),
    }),
  });

  await assert.rejects(
    () => failingUnregister.unsubscribeFromPush(),
    /Push unregister failed/,
  );
  assert.equal(unsubscribed, true);
});
