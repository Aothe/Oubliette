# Do we need a creator launchpad, and if so which one

*Written 2026-10-22. A quick stab, about 25 web fetches, read-only. Facts carry one of three tags:
MEASURED (read from RH Chain by this repo's probes, with the date), SOURCED (the URL was opened
today, or the repo's note that opened it is named), INFERRED (reasoning, or a search-result snippet
whose page was not opened). The Pons numbers from `docs/capital.md` §3 are reused, not re-measured.
Nothing here is a decision or legal advice; the operator decides.*

## Verdict

1. **A launchpad is not necessary for the token.** The game token is a plain ERC-20 and Uniswap
   v2/v3/v4 are live on RH Chain; the contract and a pool cost under a dollar of gas and an
   afternoon. The gear NFTs, the consumables and the game's own exchange are the game's contracts
   whichever way the token is born; no launchpad touches them.
2. **It is necessary for one thing: a public price without anyone on our side owning liquidity.**
   A Uniswap pool is empty until someone puts ETH and token in, and the guardrails forbid the
   operator that position. A launchpad is a bonding curve whose buyers' ETH *becomes* the locked
   pool. That is the whole of what we would be buying, and it is exactly the thing we cannot build
   in a day ourselves (a curve of our own is weeks plus an audit).
3. **Two live candidates, both same-day, both about free.** Pons v2 (pseudonymous team, v2
   unaudited, ~$2 to launch, pays the creator 0.7 % of volume in ETH, can redirect that payout
   after a three-day public delay) and Pools.trade (Uniswap Labs, launched 2026-08-05, zero
   launchpad fee, 0.25 % LP fee locked into the pool, creator may take 0.05 %). Two other RH Chain
   launchpads have already died: Noxa (halted 2026-07-11, lost its domain) and Vlad.fun (self-
   suspended 2026-07-15 over an "internal integrity issue" in its own team).
4. **Fastest route:** either launchpad, today, with the creator tax at zero and an ETH pair. Speed
   is a tie; choose on dependency. **Recommendation:** default to Pools.trade — a named operator,
   no launchpad fee, no power over the payout worth worrying about — unless the operator wants the
   Pons creator fee, which at the model's volume is $11 a month per 600 delvers (`docs/capital.md`
   line (b)) and at Pools.trade's 0.05 % would be under $1. Neither pays the bills; the repair fee
   does. Before any gear contract is written, verify by one simulated transfer that the launched
   token's `transfer()` is untaxed (could not be checked today: the explorers block this sandbox).
5. **What it risks:** a launchpad can change its fee split and buyback policy and, on Pons, the
   payout recipient; neither can unlock the liquidity or mint supply. A self-deployed token has
   none of those powers but needs a liquidity owner, which we do not have.

## 1. Pons v2: what it provides and requires

- Reused from `docs/capital.md` §3 (MEASURED 2026-10-02/03; SOURCED https://docs.ponsfamily.com/v2
  then): factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`; a launch costs 0.0005 ETH plus
  ~3.8 M gas (~$2) and is open to any address; the whole 1 B supply goes on the curve, the creator
  gets no allocation; at 4.2 ETH raised it graduates to a Uniswap v4 pool locked for good; every
  trade pays 1 %, Pons keeps 30 %, so the creator earns 0.7 % of volume in ETH; optional creator
  tax ≤ 10 % fixed at launch; Pons can redirect the payout after a public three-day delay; no
  completed audit.
- Today the docs refuse this sandbox (HTTP 403 from both the fetcher and curl with a browser
  agent); the facts below are from two secondary write-ups and the chain.
- SOURCED https://www.datawallet.com/crypto/pons-explained (updated 2026-09-03): v2 tokens start on
  a bonding curve and graduate into a locked Uniswap v4 pool when the curve sells out (anyone can
  retrigger a failed graduation); pairing assets ETH, USDG, tokenised stocks or cbBTC, and "Pons
  approves pairing assets"; liquidity is one full-range position in a locker that "neither the
  creator nor Pons can unlock"; snipe protection is a 99 % buy tax on the curve decaying to zero
  over five seconds, creator exempt; 1 % fee on the curve and after — the graduated pool itself
  charges nothing, the v4 hook charges and splits "by launch policy"; the creator tax is optional,
  ≤ 10 %, and cannot be raised after launch; no creator allocation before trading, the creator may
  buy at the open; the protocol's share spends 80 % buying and burning PONS, and that split "is not
  immutable"; a community takeover can redirect creator fees but not pricing, supply or
  liquidity; team pseudonymous ("Ozzy", @MEADGod), Pons Labs, LLC runs the interface; v2 unaudited
  with SB Security, Dingbats and Pashov reviews in progress, no report published.
- SOURCED https://en.cryptonomist.ch/2026/07/23/pons-v2-upgrade-eth-bonding-curve/ (pre-launch):
  ETH-denominated curve, 4.2 ETH graduation; creator payouts default to ETH, USDG or a tokenised
  RWA selectable at deployment; the takeover sits behind a "three-day timelock"; v1 could not
  change the fee recipient and v2 was built so it can; developer wallets keep configurable trading
  restrictions, ordinary wallets have none.
- Status: live and the chain's dominant launchpad. SOURCED https://api.llama.fi/summary/fees/pons-v2
  (JSON, 2026-10-22): $424 k fees on 22 Oct (partial day), $3.12 M over 7 days, $28.9 M over 30,
  $168.7 M all time; every day from 13 to 22 Oct between $252 k and $536 k. Its methodology counts
  launch fees, curve fees and post-graduation hook fees. No pause, exploit or published audit found
  in a search of October coverage (INFERRED from absence).
- MEASURED 2026-10-22 (RPC `eth_getStorageAt`, `eth_getCode`): the factory holds 24,177 bytes of
  code and its EIP-1967 implementation, beacon and admin slots are all zero — not an upgradeable
  proxy. What Pons can change, it changes through owner-settable parameters (the fee recipient via
  the timelocked takeover, the buyback split), not by swapping the contract.
- Restrictions on the creator: no KYC or allowlist on chain (any address may launch — MEASURED);
  the interface's terms were not read; no exclusivity found (INFERRED).
- The token: fixed supply, no mint function (SOURCED for PONS itself; INFERRED for launched
  tokens). Whether its own `transfer()` is untaxed is INFERRED from the v2 design (the 99 % tax is
  on curve buys, the 1 % is a swap hook) and not verified — see §4 and "Could not verify".

## 2. The plain alternative: our own ERC-20 and a Uniswap pool

- SOURCED https://blog.uniswap.org/robinhood-chain-is-live (2026-07-02): Uniswap v2, v3, v4 and
  UniswapX are live on 4663 and Uniswap is "the primary public AMM"; the Web App, Wallet and API
  support the chain from day one, including providing liquidity. MEASURED (`docs/chain.md` §1):
  swaps are 60 % v4 PoolManager, 34 % v3 pools. Creating a pool from the Web App is a standard
  feature on its supported chains (INFERRED; the post does not say it in words).
- Robinhood Wallet: Robinhood's chain page says users "send, receive, and swap" on RH Chain while
  its Wallet FAQ's swap list omits the chain (INFERRED from search snippets of robinhood.com
  support pages; neither opened). Bitget Wallet swaps "supported" RH Chain tokens only (INFERRED).
  Count on Uniswap's app and aggregators for the price, not on the Robinhood app.
- Cost (INFERRED from the chain's 0.02–0.04 gwei base fee, `docs/chain.md`): an ERC-20 deploy
  ~1–1.5 M gas, a v3 pool ~4.5–5 M gas (it deploys a contract), a v4 pool a fraction of that —
  under a dollar in all. Price: the Uniswap app shows one as soon as a pool has liquidity.
- **The real difference is the seed.** A pool prices nothing until someone deposits both sides,
  and `docs/capital.md` line (c) rejects the operator owning that position. Ways round it:
  - A launchpad curve (Pons, Pools.trade): buyers' ETH becomes the locked pool; the operator
    holds nothing. Same-day. This is §1 and §3.
  - A curve of our own: the same shape in a few hundred lines, graduating into a locked v4
    position — weeks, an audit, and a contract that must be right the first time (INFERRED).
  - Doppler (Whetstone) is the general-purpose version of this (auction, then migration;
    beneficiaries earn swap fees, protocol takes 5 %) but SOURCED https://docs.doppler.lol/explainer
    lists Base, Ethereum, Monad and Solana devnet — not RH Chain.
  - A third party seeds the pool (a merchant, a market maker): allowed by the letter of the
    guardrail, but it is a counterparty with a position in the token (INFERRED).

## 3. Other launchpads live on RH Chain today

- **Pons v2** — see §1. Live; ~$29 M of fees in 30 days (SOURCED, DefiLlama API).
- **Pools.trade** (Uniswap Labs; https://pools.trade redirects to https://pools.xyz, whose page
  rendered only its title). SOURCED
  https://forklog.com/en/uniswap-labs-launches-meme-token-platform-on-robinhood-chain/ (2026-08-05):
  no-code launch, 1 B supply, two modes — "Instant" (trading starts at once on a preset curve, no
  minimum) and "Crowd" (a four-hour TWAP sale; trading opens only if the issuance reaches a
  $10,000 valuation, else funds are returned); liquidity ends in a permanently locked Uniswap v4
  pool; 0.25 % LP fee autocompounded into that liquidity by default; the creator may take 0.05 %
  out of the 0.25 %; "zero launchpad fee"; the creator can buy in the creation block. Uniswap Labs
  says it does not vet assets. Not stated: who controls the lock, the token standard, admin powers.
- **Noxa** — halted new launches 2026-07-11 citing spam, lost control of its domain, went silent
  (INFERRED from search snippets: brokerchooser, coingape). **Vlad.fun** — the launchpad that
  "self-suspended": SOURCED https://cointelegraph.com/news/robinhood-chain-memecoin-vladfun-halts-integrity
  (2026-07-16): took itself offline 2026-07-15 over "a serious internal integrity issue involving
  members of its own team", consulting counsel; later reports say two external developers
  hardcoded their own token into the front end (INFERRED, snippet). Status since unknown.
- No others found. Two of four launchpads on a four-month-old chain are dead; the survivors are the
  pseudonymous one and Uniswap Labs' own.

## 4. Does any of this touch the NFTs or the exchange?

- No. Gear is ERC-721 and consumables ERC-1155 (`docs/chain.md` §4), listings are escrowed by the
  game's exchange (SPEC §3.7); a launchpad deploys and prices only the ERC-20. Nothing in either
  launchpad's design reaches another contract.
- What a launchpad token *could* impose: a tax in the token's own `transfer()`. That would bite
  every mint burn, every escrow move and every fill. On Pons v2 the two taxes found are on curve
  buys (the 99 % snipe decay) and on swaps (the 1 % hook, the optional creator tax) — INFERRED to
  leave plain transfers alone; set the creator tax to 0 regardless. Pools.trade's fee is the
  pool's LP fee (SOURCED), so the token is presumably plain (INFERRED). A self-deployed ERC-20 is
  plain by construction.
- Burning: if the token has no `burn()`, the game sends to a dead address; either way circulating
  supply only falls, which is what §3.2 needs (INFERRED). Fixed supply and no mint function hold
  for Pons tokens (INFERRED from PONS's own); write both into our own if we deploy.

## 5. Speed to live

| path | time to a public price | money | dependency |
|---|---|---|---|
| Pons v2 | minutes; the curve prices from the first buy, a v4 pool at 4.2 ETH (~$11 k) | ~$2 | pseudonymous team, v2 unaudited; fee recipient redirectable after 3 days (public), buyback split mutable; liquidity lock and supply immutable |
| Pools.trade | minutes (Instant) or 4 h + a $10 k bar (Crowd) | gas only | Uniswap Labs' front end and hook; the pool is a permissionless v4 pool; creator earns 0.05 % at most |
| own ERC-20 + pool | an afternoon to deploy; a price only when someone seeds | < $1 gas, then the seed | none on the token (unpausable if written so); the seed is the problem the guardrails create |
| own curve | weeks + audit | $5–20 k (INFERRED) | ours; the slowest |

What changes in the SPEC if the choice is Pools.trade rather than Pons: §2 "The token" ("like any
Pons-launched coin") and `docs/capital.md` line (b) — 0.7 % becomes 0.05 % of volume. Nothing else.

## Could not verify

- https://docs.ponsfamily.com/v2 — HTTP 403 from this sandbox by two methods; the v2 facts stand on
  the repo's 2026-10-02/03 reading and two secondary sources dated July and September.
- Whether a Pons v2 (or Pools.trade) token's `transfer()` is untaxed: Blockscout's API and
  DefiLlama's HTML both return 403 here. One `eth_simulateV1` transfer between two EOAs, balances
  checked 1:1, settles it; do it before the gear contract is written.
- Pools.trade's own page (JavaScript-only), its docs and terms; who holds the lock; admin powers.
- Whether Robinhood Wallet swaps arbitrary tokens on RH Chain (its own pages conflict; not opened).
- Any published Pons audit; Pons Labs' terms (KYC, exclusivity); Vlad.fun's status after July.
- Pool-creation gas on 4663 (not measured; the estimate is from the base fee and typical sizes).
