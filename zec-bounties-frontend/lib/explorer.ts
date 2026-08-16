// Chain-aware block-explorer links, shared by the transactions tables and the
// bounty page. Accepts both vocabularies used in this codebase: wallet chains
// ("mainnet"/"testnet") and bounty chains ("MAIN"/"TEST").
export function getExplorerUrl(
  txid: string,
  opts: { chain?: string; serverUrl?: string } = {},
): string {
  const isTestnet =
    opts.chain === "testnet" ||
    opts.chain === "TEST" ||
    (opts.serverUrl ?? "").includes("testnet");

  return isTestnet
    ? `https://zexplorer.app/testnet/tx/${txid}`
    : `https://blockchair.com/zcash/transaction/${txid}`;
}
