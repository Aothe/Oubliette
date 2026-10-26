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
   does. The launched token's `transfer()` is untaxed and it burns — MEASURED 2026-10-23 by
   simulation on three live Pons v2 tokens (the section "Measured 2026-10-23" below); Pools.trade's
   token is still unchecked.
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
- The token: fixed supply, no mint function — MEASURED 2026-10-23 on three launched tokens (no
  `mint` selector in the code; `totalSupply` 1 B × 1e18). Its `transfer()` is untaxed and it has
  `burn`/`burnFrom` — MEASURED by simulation the same day (the section "Measured 2026-10-23"); the
  99 % snipe tax is on curve buys and the 1 % fee lives in the curve and the swap hook, not in the
  token.

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
  buys (the 99 % snipe decay) and on swaps (the 1 % hook, the optional creator tax) — MEASURED
  2026-10-23 to leave plain transfers alone, from EOAs and from contracts, before and after
  graduation (below); set the creator tax to 0 regardless. Pools.trade's fee is the
  pool's LP fee (SOURCED), so the token is presumably plain (INFERRED). A self-deployed ERC-20 is
  plain by construction.
- Burning: a Pons v2 token has `burn(uint256)` and `burnFrom(address,uint256)` and `totalSupply`
  falls by the amount (MEASURED 2026-10-23, below), so the dead-address fallback is not needed for
  Pons; keep it for any other token. Fixed supply and no mint function hold for Pons tokens
  (MEASURED, same run); write both into our own if we deploy.

## 5. Speed to live

| path | time to a public price | money | dependency |
|---|---|---|---|
| Pons v2 | minutes; the curve prices from the first buy, a v4 pool at 4.2 ETH (~$11 k) | ~$2 | pseudonymous team, v2 unaudited; fee recipient redirectable after 3 days (public), buyback split mutable; liquidity lock and supply immutable |
| Pools.trade | minutes (Instant) or 4 h + a $10 k bar (Crowd) | gas only | Uniswap Labs' front end and hook; the pool is a permissionless v4 pool; creator earns 0.05 % at most |
| own ERC-20 + pool | an afternoon to deploy; a price only when someone seeds | < $1 gas, then the seed | none on the token (unpausable if written so); the seed is the problem the guardrails create |
| own curve | weeks + audit | $5–20 k (INFERRED) | ours; the slowest |

What changes in the SPEC if the choice is Pools.trade rather than Pons: §2 "The token" ("like any
Pons-launched coin") and `docs/capital.md` line (b) — 0.7 % becomes 0.05 % of volume. Nothing else.

## Measured 2026-10-23 — a Pons v2 token's transfers and burn (`probe/chain/pons.mjs`)

*Read-only, about a minute, three public RPCs; every call is `eth_call`, `eth_getLogs`,
`eth_getCode`, `eth_getStorageAt` or `eth_simulateV1`; nothing was sent, no key was held. Tip
96,114,974 at 2026-10-23T17:31Z, 9.59 blocks/s. Report: `probe/chain/out/pons.txt` (gitignored —
re-run `node probe/chain/pons.mjs > probe/chain/out/pons.txt`). Tags as in the rest of this file.*

**Verdict: a Pons v2 token is a plain ERC-20. Transfers are untaxed and unhooked — from EOAs and
from contracts, before and after graduation — and the token has `burn(uint256)` and
`burnFrom(address,uint256)`, both of which lower `totalSupply`. Nothing in SPEC §3.2 or §3.7
changes for the token.**

- **The tokens (MEASURED).** The probe walks the factory's `TokenLaunched` logs and picks three
  tokens with an EOA holder: the newest, `0x73437eed7061aff03232281ac15f13650b350093` "Make
  Robinhood Great Again" (MRGA), launched at block 96,114,912 one minute before the run, paired
  with USDG (graduation at 8,090 USDG); one a week old,
  `0xa15d6eb8352d2846b5edf8ca539002c07bee4e39` "MINE SHOP", block 90,314,926 (2026-10-16, 6.93
  days), ETH pair, still on its curve; and one graduated,
  `0x6f5f83df51ae02666843d154f5aee0d4a8c8091b` "DRIP", launched at 95,964,065 and graduated at
  96,102,140 (tx `0x2efef8e1…935e73`) — the receipt holds the Uniswap v4 PoolManager
  `0x8366a39c…0951`'s `Initialize` with currencies ETH / DRIP, fee 0, tick spacing 200 and hook
  `0xe5e70264…e044` (= `factory.memeHook()`), 204,081,632.65 tokens and 4.2 ETH into the pool, and
  81.6 M tokens into the locker (`GraduationTokensPermanentlyLocked`).
- **The code (MEASURED).** Every token is 3,248 bytes (3,195 runtime + 53 metadata), 18
  decimals, supply 1,000,000,000 × 1e18; not a proxy (EIP-1967 slots zero, no EIP-1167 pattern, no
  `DELEGATECALL`); the three differ in 60 bytes and are byte-identical once each token's curve and
  deployer addresses (immutables) are masked. Selectors present: the nine ERC-20 functions,
  `burn(uint256)`, `burnFrom(address,uint256)`, `curve()`, `deployer()`, `launchFactory()`,
  `getTokenInfo()`, `logo()`, `description()`, `socials()`, OpenZeppelin v5 errors, four unnamed.
  Absent: `mint`, `pause`, `paused`, `owner`, `permit`, and every fee / tax / blacklist /
  maxWallet / tradingEnabled name tried. Opcode census of the runtime: SLOAD 18, SSTORE 6, CALLER
  7, LOG3 3 and **no CALL, STATICCALL, DELEGATECALL, CREATE or SELFDESTRUCT** — the token cannot
  consult the factory, the curve or the hook. The 1 % fee (`curve.feeBps()` = 100), the creator
  tax (`creatorTaxBps()` 0 / 180 / 300 on the three) and the snipe tax (`snipeTaxStartBps()`
  9,900 for `snipeTaxSeconds()` 3 — three seconds, not the five the write-ups say) live in the
  curve and the v4 hook (INFERRED from where the getters are; the simulations are the measurement).
- **Transfers (MEASURED).** `eth_simulateV1` on publicnode on top of blocks 96,115,305 / 318 /
  344, the first six calls replayed on the official RPC and dRPC with identical status, return
  data and logs: 33 / 32 / 32 checks passed, 0 failed. A holder's `transfer` of 1,000,000 units to
  a never-seen address: holder −1,000,000 exactly, fresh +1,000,000 exactly, one `Transfer` log,
  no log from any other contract, 51,328 gas (a stock OpenZeppelin ERC-20's cold transfer). The
  same exactness for `transferFrom` by an approved EOA (allowance 1,000,000 → 0); a transfer sent
  by a **contract** (a 32-byte forwarder injected by state override, standing in for Gear and the
  exchange); `transferFrom` called by a contract spender; a self-transfer; a zero-amount
  transfer; a transfer to the curve contract; and a transfer by the token's own deployer (the
  "developer wallet" the write-ups say can be restricted — on the newest token it moved freely).
  `transfer` with no balance reverts `ERC20InsufficientBalance`; `transferFrom` with no allowance
  reverts `ERC20InsufficientAllowance`.
- **Burn (MEASURED, same simulations).** `burn(1e6)` from the holder emits `Transfer(holder →
  0x0)` and `totalSupply` falls by exactly 1e6; `burnFrom` by an approved EOA, `burn` by a
  contract of its own balance, and `burnFrom` by a contract spending the holder's allowance do the
  same — four burns, `totalSupply` 1e27 → 1e27 − 4e6. A transfer to `0x…dEaD` succeeds and leaves
  `totalSupply` unchanged; the fallback is not needed.
- **The factory (MEASURED).** 24,177 bytes, not a proxy. `owner()` = `0x263ed295…19dd`, a
  171-byte contract that answers Safe getters — 3 owners, threshold 2, version 1.4.1 (a Safe-shaped
  2-of-3 multisig, INFERRED from the getters, not from source). `launchFee()` 0.0005 ETH;
  `maxCreatorTaxBps()` 1,000; `launchEnabled()` 1; `CREATOR_FEE_RECIPIENT_TIMELOCK()` 259,200 s;
  `CREATOR_FEE_RECIPIENT_EXECUTION_WINDOW()` 259,200 s; `GRADUATION_RESCUE_DELAY()` 604,800 s.
  `getLaunchFeePolicy(token)` = (`0x31ea5b45…2cdb`, 3000, 5000, 100, 300): the protocol's fee
  recipient, 30 % protocol share of the 1 % fee, 50 % of that to buyback-and-burn, 1 % fee, 3 % max
  internal price impact (field names from the curve's getters of the same values).
  `getLaunchedToken(token)` returns (token, curve, deployer, creator fee recipient, pair token,
  threshold, …, creator tax bps, …). Events in 8.7 h: 686 `TokenLaunched` (≈ 1,900 launches a
  day), 80 `CreatorFeeRecipientUpdated`, 8 `BuybackEnabledUpdated`, 6 graduations (54 in 2.4
  days, ≈ 22 a day). Function and event names are SOURCED from api.openchain.xyz for the selectors
  the probe's dictionary did not know (56 of 98) and each is keccak-checked — a wrong name cannot
  match; no verdict above rests on a name.
- **The payout (MEASURED by simulation; nothing sent).** A stranger's `setCreatorFeeRecipient`
  reverts `OwnableUnauthorizedAccount`; a stranger's `transferCreatorFeeRecipient` reverts
  `NotCreatorFeeRecipient()`. **The factory owner's `setCreatorFeeRecipient(token, X)` succeeds
  but only queues:** `pendingCreatorFeeRecipient(token)` becomes (X, block time + 259,200 s, block
  time + 518,400 s) and `getLaunchedToken` is unchanged — the three-day public delay is real, with
  a three-day window to execute after it (`executeCreatorFeeRecipientChange` and
  `cancelCreatorFeeRecipientChange` exist). **The current recipient's
  `transferCreatorFeeRecipient(token, X)` succeeds at once:** the record's recipient changes and
  `CreatorFeeRecipientUpdated(token, old, new)` fires — the creator can point the payout at a
  contract (a treasury, a splitter) in one transaction, no delay. `setBuybackEnabled(token, bool)`
  succeeds for the current fee recipient and reverts `NotBuybackController()` for anyone else,
  a deployer who is no longer the recipient included.
- **What it means here (INFERRED from the above).** §3.2's burns can be `burnFrom(player, cost)`
  after an approval, or `burn` on tokens the contract holds, and `totalSupply` falls — no
  dead-address sink. The exchange's escrow is a plain `transferFrom`. Nothing in the token tells an
  EOA from a contract or a curve-phase token from a graduated one. Pons's one power over a token's
  economics after launch is the timelocked fee-recipient change, which cannot touch balances.

**Still not verified after this run:** the factory owner's other setters (launch config, snipe
tax, pair tokens, whitelisted launchers, `rescueCurveFees`, `forceSweptGraduation`,
`rescueSweptGraduation` — named, none exercised); what the v4 hook does at swap time (the pool
key's fee is 0; the hook charges); any token launched after the run; Pools.trade's token.

## Could not verify

- https://docs.ponsfamily.com/v2 — HTTP 403 from this sandbox by two methods; the v2 facts stand on
  the repo's 2026-10-02/03 reading and two secondary sources dated July and September.
- ~~Whether a Pons v2 token's `transfer()` is untaxed~~ — settled 2026-10-23 (`probe/chain/pons.mjs`,
  the section above): untaxed, unhooked, burnable, on three live tokens. Whether a Pools.trade
  token's is: still unchecked; the same probe can be pointed at one once one is found on 4663.
- Pools.trade's own page (JavaScript-only), its docs and terms; who holds the lock; admin powers.
- Whether Robinhood Wallet swaps arbitrary tokens on RH Chain (its own pages conflict; not opened).
- Any published Pons audit; Pons Labs' terms (KYC, exclusivity); Vlad.fun's status after July.
- Pool-creation gas on 4663 (not measured; the estimate is from the base fee and typical sizes).
