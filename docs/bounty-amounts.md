# Bounty amounts

Guide for anyone creating or suggesting a bounty.

The form only asks for a **ZEC** reward. There is no USD field. Use a USD interval in your head (or in the description) so the ZEC number you type stays fair as the rate moves.

Payouts are always shielded ZEC. USD is only a planning unit.

## Suggesting an amount

1. Match the work to an interval below.
2. Pick a USD target inside that band — not automatically the top.
3. Look up a public ZEC/USD spot (CoinGecko, Coinbase, Kraken, or Binance).
4. Convert:

```
zec_to_enter = usd_target / zec_usd_spot
```

5. Type that ZEC value into **Reward (ZEC)**. Round to 4 decimal places.
6. Optional but useful: mention the USD band and the spot you used in the description so reviewers can check the conversion.

Example: short wiki page, S band, `$20` target, spot `$800` / ZEC → enter `0.0250` ZEC.

If you only remember old frozen tips (`0.05 ZEC` newsletter, `0.08 ZEC` wiki), those were snapshots at an older rate. Convert from the USD interval instead.

## Suggested intervals

These are what you should propose. Admins can still adjust before the bounty goes live.

| Interval | Implicit USD | Suggest this kind of work |
|----------|--------------|---------------------------|
| XS | $8–$15 | Newsletter edition, broken-link fix, small copy edit |
| S | $15–$30 | New short wiki page, accepted translation, small docs PR |
| M | $30–$80 | Substantial wiki or tutorial (video), medium application change |
| L | $120–$250 | Multi-file feature, wallet/tooling work, longer research |
| XL | $250–$400 | Large approved PR or multi-day engineering task |

Stay inside the band. Do not treat the top as the default.

## ZEC is re-quoted at payout

You enter Reward (ZEC). The platform snapshots that reward's USD value when the bounty is created. The board shows ZEC, and the ZEC amount is recalculated from the stored USD value when the payout round opens.

Approvers sign the recalculated amount. Once the round is opened, the ZEC amount is locked; it is not changed again during the send.

Worked example:

- Suggested: `$20` (S) at `$500` / ZEC → created as `0.0400` ZEC
- Payout week: spot `$800` / ZEC → the round pays `0.0250` ZEC
- Same USD value; different ZEC quantity

If ZEC falls, the payout requires more ZEC. The payout panel shows the quote and warns when the rate has moved significantly, so the paying wallet can be funded before the round is opened.

## Rounding

- Enter ZEC to **4 decimal places**.
- Prefer rounding so the implied USD value does not sit more than about **$1** under the target you chose.
- Do not post dust below `0.0001` ZEC.

## Hunters

You will see a ZEC amount on the card, not a dollar amount. That ZEC number was chosen with the intervals above. If the listing looks off relative to the work, ask the creator or an admin which band they meant.

## Next

[Creators →](creators.md) · [FAQ →](faq.md)
