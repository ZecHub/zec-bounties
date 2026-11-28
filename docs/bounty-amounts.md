# Bounty amounts

Guide for anyone creating or suggesting a bounty.

The form only asks for a **ZEC** reward. There is no USD field. Use a USD interval in your head (or in the description) so the ZEC number you type stays fair as the rate moves.

Payouts are always shielded ZEC. USD is only a planning unit.

## Suggesting an amount

1. Match the work to an interval below.
2. Pick a USD target inside that band — not automatically the top. Prefer the lower half.
3. Look up a public ZEC/USD spot (CoinGecko, Coinbase, Kraken, or Binance).
4. Convert:

```
zec_to_enter = usd_target / zec_usd_spot
```

5. Type that ZEC value into **Reward (ZEC)**. Round to 4 decimal places.
6. Optional but useful: mention the USD band and the spot you used in the description so reviewers can check the conversion.

Example: short wiki page, S band, `$8` target, spot `$750` / ZEC → enter `0.0107` ZEC.

If you only remember old frozen tips (`0.05 ZEC` newsletter, `0.08 ZEC` wiki), those were snapshots at an older rate. Convert from the USD interval instead.

## Suggested intervals

These are what you should propose. Admins can still adjust before the bounty goes live.

| Interval | Implicit USD | Suggest this kind of work |
|----------|--------------|---------------------------|
| XS | $3–$6 | Typos, broken links, one-line data/chart fixes, trivial copy |
| S | $6–$12 | Short wiki pages, translations, small docs PRs, simple helper + tests |
| M | $12–$25 | Medium app changes, multi-section wiki, non-trivial chart/data fixes with tests |
| L | $50–$120 | Multi-file features, tooling, sustained research |
| XL | $120–$220 | Large approved PRs, multi-day engineering, high-impact protocol-adjacent work |

Stay inside the band. Default to the lower half. Do not treat the top as the default.

Pure AI-scaffolded or near-mechanical PRs should land in XS or be merged unpaid.

## The form only stores ZEC

zec-bounties does not price in dollars and does not refresh the reward by itself. Whatever you enter in Reward (ZEC) is what the board shows and what a payout sends.

If the dollar rate has moved a lot between listing and pay, edit the ZEC field before authorizing payment so the implicit USD value is still in the same band.

Recompute when **any** of these is true:

- Spot has moved **≥ 20%** from the rate you used
- More than **7 days** since you set the amount
- Payment is about to run

Worked example:

- Suggested: `$8` (S) at `$500` / ZEC → listed `0.0160` ZEC
- Payout week: spot `$750` / ZEC → change the reward to `0.0107` ZEC
- Same implied dollar value; different ZEC quantity

If ZEC falls, the ZEC number should go up. Fund the paying wallet for that case.

Do not change the implied USD band after assignment unless scope changed.

## Rounding

- Enter ZEC to **4 decimal places**.
- Prefer rounding so the implied USD value does not sit more than about **$1** under the target you chose.
- Do not post dust below `0.0001` ZEC.

## Hunters

You will see a ZEC amount on the card, not a dollar amount. That ZEC number was chosen with the intervals above. If the listing looks off relative to the work, ask the creator or an admin which band they meant.

## Next

[Creators →](creators.md) · [FAQ →](faq.md)
