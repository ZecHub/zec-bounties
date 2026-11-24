const executeZingoParseAddres = require("../utils/zingo/zingoLibParseAddress.js");

function extractParsedResult(state) {
  if (Array.isArray(state)) {
    return state[1] ?? state[0] ?? null;
  }
  return state && typeof state === "object" ? state : null;
}

async function verifyAddressForChain(z_address, params, expectedChain) {
  try {
    const state = await executeZingoParseAddres(z_address, params);
    const result = extractParsedResult(state);
    if (!result || typeof result !== "object") {
      return null;
    }
    return (
      result.status === "success" &&
      typeof result.chain_name === "string" &&
      `${result.chain_name}net` === expectedChain
    );
  } catch {
    return null;
  }
}

async function verifyZaddress(z_address, params) {
  return verifyAddressForChain(z_address, params, "testnet");
}

async function verifyUaddress(z_address, params) {
  return verifyAddressForChain(z_address, params, "mainnet");
}

module.exports = {
  verifyZaddress,
  verifyUaddress,
  extractParsedResult,
};
