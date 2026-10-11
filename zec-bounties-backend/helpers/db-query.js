const executeZingoParseAddres = require("../utils/zingo/zingoLibParseAddress.js");

async function verifyZaddress(z_address, params) {
  const state = await executeZingoParseAddres(z_address, params);

  console.log(state);
  try {
    const result = state[1] || state;
    if (
      result.status === "success" &&
      result.chain_name + "net" === "testnet"
    ) {
      return true;
    } else {
      return false;
    }
  } catch {
    return null;
  }
}

async function verifyUaddress(z_address, params) {
  const state = await executeZingoParseAddres(z_address, params);

  console.log(state);
  try {
    const result = state[1] || state;
    if (
      result.status === "success" &&
      result.chain_name + "net" === "mainnet"
    ) {
      return true;
    } else {
      return false;
    }
  } catch {
    return null;
  }
}

module.exports = {
  verifyZaddress,
  verifyUaddress,
};
