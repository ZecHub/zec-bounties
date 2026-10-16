const { getZingo } = require("./getZingo");

async function executeZingoQuickSend(recipients, params) {
  const zingo = getZingo(params, { forSend: true });
  return await zingo.quicksend(recipients);
}

module.exports = executeZingoQuickSend;
