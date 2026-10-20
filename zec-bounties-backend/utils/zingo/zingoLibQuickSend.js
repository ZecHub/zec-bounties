const { getZingo, withSendLock, zingoKey } = require("./getZingo");

async function executeZingoQuickSend(recipients, params) {
  const key = zingoKey({
    chain: params.chain,
    serverUrl: params.serverUrl,
    dataDir: params.dataDir,
  });
  return withSendLock(key, async () => {
    const zingo = getZingo(params, { forSend: true });
    return zingo.quicksend(recipients);
  });
}

module.exports = executeZingoQuickSend;
