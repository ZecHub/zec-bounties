// Chain-aware block-explorer links, shared by the transactions tables and the
// bounty page. Accepts both vocabularies used in this codebase: wallet chains
// ("mainnet"/"testnet") and bounty chains ("MAIN"/"TEST").
export function getExplorerUrl(
  txid: string,
  opts: { chain?: string; serverUrl?: string } | null = {},
): string {
  const safeOpts = opts ?? {};
  const chain = typeof safeOpts.chain === "string" ? safeOpts.chain.trim().toLowerCase() : "";
  const serverUrl = typeof safeOpts.serverUrl === "string" ? safeOpts.serverUrl.toLowerCase() : "";
  const isTestnet =
    chain === "testnet" ||
    chain === "test" ||
    serverUrl.includes("testnet");

  const encodedTxid = encodeURIComponent(typeof txid === "string" ? txid.trim() : "");

  return isTestnet
    ? `https://zexplorer.app/testnet/tx/${encodedTxid}`
    : `https://blockchair.com/zcash/transaction/${encodedTxid}`;
}
