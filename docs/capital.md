# Starting capital: what the system needs, what the operator needs, and when it pays for itself

*Written 2026-10-03. Measurements are reproducible by the scripts named beside them; web facts carry
the URL that was opened; everything else is labelled inference. This is a sizing, not a plan, and
nothing in it is legal advice. The simulated dollar scale is an assumption of the model (its budgets
are calibrated to its prices), so every dollar figure derived from the simulation scales with the
entry price the operator eventually chooses.*

## Verdict

1. **The on-chain system itself needs almost no seed money.** The token is born on a launchpad
   bonding curve for about $2 with no liquidity from the operator; the boss treasury fills from
   the ETH side of mints; merchants fund their own stock (about $215 each in the model); gear
   supply starts at zero and minting is always available. There is nothing to pre-fund.
2. **Proving the game is fun costs under $200 a month.** Both prototypes run from a file; no
   token, contract, entity, counsel or audit is needed for the thirty-run play test.
3. **The smallest honest on-chain launch is about $21,000 once, a $10,000 bug-bounty reserve, and
   about $460 a month.** A sensible launch with three dungeons and counsel on retainer is about
   $126,000 once, $25,000 held, and $10,600 a month. One salary doubles the sensible run-rate.
4. **As specified, the operator earns nothing.** Every dollar a player spends goes to whoever sold
   them the token (77 %) or into the stock-drop treasury (23 %). Cosmetics are the only revenue
   line SPEC names, and they are not v0. This is the decision the capital question hangs on.
5. **At the model's scale the economy is small:** 600 delvers put in about $68 a day ($0.11 per
   delver per day, $0.37 per run). With three operator lines that fit the guardrails — an ETH
   fee on repair, half the ETH side of mints, and the launchpad's creator fee — the operator
   takes about $0.08 per delver per day. Bare-bones costs then need about 200 delvers, $2,000 a
   month about 830, the sensible run-rate about 4,400, and $40,000 a month about 16,600 — all
   proportional to the assumed price scale, and all before taxes or a salary.
6. **There is no minimum population in the arithmetic.** Delvers' per-head flows are flat from
   about 50 delvers up; the equilibrium holds in a small world. Whether a small world is fun or
   its exchange liquid is untested.
7. **The number that most needs measuring is dollars a real delver spends per day played.** The
   model assumes $0.37; the players needed to break even are inversely proportional to it.

## 1. What the simulated economy moves

MEASURED — `sim/population.py` (its Part 1 reproduces `sim/out/sweep2_summary.csv` exactly), 600
delvers, 8 merchants, 50,000 token per ETH, ETH = $2,682 (CoinGecko, 2026-10-02).

| per day | s = 0, d0 .10 | s = 0, d0 .20 | s = ⅓, d0 .10 | s = ⅓, d0 .20 |
|---|---|---|---|---|
| runs; priced out | 173; 42 % | 155; 49 % | 182; 39 % | 165; 45 % |
| tier-1 mints (tiers 2–3 ≈ 0) | 6.6 | 16.6 | 2.8 | 10.5 |
| token burned: mint + repair + fee | 789 + 350 + 35 ($63) | 1,998 + 198 + 34 ($120) | 341 + 374 + 58 ($41) | 1,258 + 214 + 59 ($82) |
| token bought | 1,188 | 2,235 | 978 | 1,743 |
| ETH into the treasury | 0.0131 ($35; $12.9k/yr) | 0.0332 ($89; $32.5k/yr) | 0.0057 ($15; $5.6k/yr) | 0.0209 ($56; $20.5k/yr) |
| gross player spend | $99 | $209 | $68 | $150 |
| per delver; per run | $0.17; $0.57 | $0.35; $1.35 | $0.11; $0.37 | $0.25; $0.91 |

Repair is already 48 % of the burn at the reference cell. The treasury that is meant to make
bosses drop stock receives 8 cents per finishing run.

## 2. A small world

MEASURED — `sim/population.py`: N ∈ {25, 50, 100, 200, 400, 600, 1200} × seeds 0–4, s = ⅓, d0 0.10
and 0.20, 10,000 days, merchants scaled as M = max(1, round(8N/600)) and, as a sensitivity, M = 8
fixed; pre-registered rule in the docstring, hash `cf81bce75085`; 150 runs, 275 s on 4 workers;
byte-identical on re-run (`--repro`, 5/5 rows; checked again by the orchestrator on 2026-10-03).

- **Per-head flows are flat** (within 10 % of the 600-delver world on runs, burn, spend and
  treasury inflow) from N = 50 up at d0 0.10 and from N = 25 up at d0 0.20, under both merchant
  rules. Results scale linearly in the delver population.
- **The sim's own verdict** (unchanged thresholds) passes at N 400–600 at d0 0.10 and from N 100
  (one merchant) or 200 (eight) at d0 0.20. What fails below that is the count-based `mint_ok`
  — days with at least one mint, which falls with N by construction (a 25-delver world mints
  0.12 items a day) — and the 1 %/yr slope rule on the worst seed. On windows holding the same
  delver-days, minting stays alive at every N (≥ 0.51 on every seed but one). Gear-up passes at
  every N.
- **Merchants do not scale.** One merchant profits on 30/30 seeds at N 25–100; at N = 1,200 the
  pooled merchant book loses on 16 of 20 runs under both rules, because each merchant's targets
  and stake are fixed while the flow through the cheapest one grows (inference). So the
  pre-registered "every larger N passes too" clause fails every N; it was badly chosen for a
  small-world question and is reported, not retuned.
- "Works at 25" means the arithmetic holds; the model has no social effects, party-finding or
  exchange-liquidity limits, and nobody in it sells token back.

## 3. How the operator could be paid

SPEC §3.2 burns the token on mint, repair and exchange fees and sends the ETH side of mints to
the drops treasury; the game never emits or pays out its token; §3.5 names cosmetics as "a
non-risk revenue line". Nothing reaches the operator. The launchpad SPEC §2 assumes:

- **Pons v2** (factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`; MEASURED by read-only
  calls on 2026-10-02 and re-read on 2026-10-03; SOURCED https://docs.ponsfamily.com/v2): a launch
  costs 0.0005 ETH plus about 3.8 M gas, about $2 in all, and is open to any address; the whole
  1 B supply goes onto a bonding curve, the creator gets no allocation; at 4.2 ETH raised it
  graduates to a Uniswap v4 pool whose liquidity is locked for good; every trade pays 1 %, of
  which Pons keeps 30 %, so **the creator earns 0.7 % of volume, in the quote asset (ETH)**, plus
  an optional creator tax fixed at launch (≤ 10 %); Pons can redirect the payout after a public
  three-day delay; v2 has no completed audit. One v2 coin, FLYBRAIN (paired against GOOGL stock
  tokens), credited its creator about 1,540 GOOGL tokens (≈ $530k) in 22 days, 86 % of it in the
  first 2.3 days and about $460 a day since — launch-week attention, not a plan.

Candidate lines, sized per 600 delvers at the model's $11.80 tier-1 kit (arithmetic from §1;
guardrail readings are inference):

| Line | Arrives in | Operator must sell token? | Guardrail | $/month | SPEC change |
|---|---|---|---|---|---|
| (a) half the ETH side of mints | ETH | no | none; halves the drops pot | 232 | §3.2 |
| (b) Pons creator fee, play volume only | ETH | no | none; disclose the recipient | 11 (171 with a 10 % tax) | §2 |
| (c) own the token/ETH liquidity | ETH + token | partly | breaks "no position" | 16 | drop Pons |
| (d) cosmetics, vault and character slots | ETH | no | none | not modelled; RotMG's own line | §7 |
| (e) an operator token allocation | token | **yes** | breaks "no position"; $2k/month = 125 % of all player buying | — | rewrites a guardrail |
| (f) keep the exchange fee instead of burning it | token | **yes** | weakens the burn | 95 | §3.2, §3.7 |
| (g) a $0.10 ETH ticket per run | ETH | no | none; untested in the sim | 555 | new section |
| (h) a cut of the stock treasury | ETH | no | same money as (a), shaped like a rake on a prize pot | as (a) | §3.2 |
| (i) **an ETH fee on repair, 0.0012 ETH** | ETH | no | none found | **1,208** | §3.5 |

(i) was measured on a patched in-memory copy of `sim/economy2.py` (3 seeds, the reference cell;
script in the session scratch, not in the repo — **a first look, not a §5 result**): $39.71 a day
per 600 delvers for 0.8 % fewer runs, burn, minting and supply unchanged. It is nearly free in
the model because its delvers spend only about 11 % of their budgets; that slack is an assumption
and the first thing a proper run should stress (wallet cap, income spread). A proper
pre-registered run belongs in the next sim.

Lines (c), (e) and (f) are out: each needs the operator to hold or sell the token, which is the
sell pressure the whole design exists to avoid. What remains to put to the operator: **(i) + (a)
+ (b)**, cosmetics and slots later, with the three SPEC decisions each needs.

## 4. Break-even

With (a) + (b) + (i) the operator takes $0.0794 per delver per day (arithmetic: 7.61 + 0.37 +
39.71 = $47.69 a day ÷ 600). Delvers needed, with those playing on a given day in brackets:

| run-rate | $464 (bare-bones) | $2,000 | $5,000 | $10,600 (sensible) | $40,000 |
|---|---|---|---|---|---|
| Pons fee only | 24,900 | 107,500 | 268,700 | 569,600 | 2.1 M |
| + half the mint ETH | 1,150 | 4,940 | 12,360 | 26,200 | 98,900 |
| + the repair fee | **190 (60)** | **830 (250)** | **2,070 (630)** | **4,390 (1,340)** | **16,600 (5,030)** |

Arithmetic: $2,000 ÷ 30.42 days ÷ $0.0794 = 828. A $2 kit multiplies every count by 5.9; a $50
kit divides it by 4.2; demand at any price is unknown. "Delvers" are the model's population, of
whom about half want to run on a given day and 39 % of those are priced out. For comparison:
Realm of the Mad God averaged 1,482 concurrent Steam players in September 2026
(https://steamcharts.com/app/200210); Cambria reported about 10,000 daily players in a season.

## 5. Costs

SOURCED benchmarks (2025–26; full table with URLs in the session notes; itemised in `budgets.py`,
re-run by the orchestrator on 2026-10-03). No vendor was asked for a quote.

| Line | low / base / high | when |
|---|---|---|
| Security review, 1,000–2,000 lines, boutique (≈ $6k per auditor-week) | 12k / 24k / 40k | once |
| Security review, top tier (≈ $25k per engineer-week) | 50k / 100k / 200k | once |
| Audit contest, pot + fees (Code4rena announced its closure 2026-05-13) | 18k / 40k / 65k | once |
| Bug-bounty reserve (Immunefi: $10k minimum critical, 10 % fee) | 10k / 25k / 100k | held |
| Legal opinions: lottery / prize promotion, then stock prizes | 5k / 25k / 50k | once |
| Entity, terms, trademark (Wyoming LLC $225 … three-entity token structure $70.5k) | 1.7k / 11.6k / 83.5k | once |
| Counsel retainer | 0 / 3k / 10k | monthly |
| Art and audio, one dungeon (code-drawn placeholder art is $0) | 0 / 3k / 19k | once |
| Art and audio, three dungeons | 5.6k / 22k / 56k | once |
| Servers, RPC, indexer, storage, mail, AI tools | 130 / 530 / 2,260 | monthly |
| Wallet vendor (Privy free < 500 MAU, $299 to 2,499, $499 to 9,999; Dynamic free to 1,000) | 0 / 300 / 3,000 | monthly |
| Token launch and deployment (Pons; measured deployment $1.2–2.4) | 4 / 4 / 50k (market maker) | once |
| Growth and community | 0 / 3.1k / 29.5k | monthly |
| Support, cheat review, accounting | 220 / 2.1k / 10.2k | monthly |
| One salary (web3.career, October 2026) | — / 10.8k / 12.5k | monthly |

**Three budgets** (inference from the unit prices; assumptions in `budgets.py`):

- **Bare-bones — $20,900 once, $10,000 held, $464 a month.** v0 scope, under 500 monthly players,
  two boutique auditor-weeks, one scoped opinion, a US LLC, code-drawn art, the operator does
  support. Eighteen months of it is about $29,000 plus the reserve.
- **Sensible — $125,700 once, $25,000 held, $10,600 a month.** Three dungeons, about 5,000
  monthly players, four auditor-weeks plus a small contest, a formal opinion, Cayman + BVI,
  counsel on retainer, one moderator. Eighteen months is about $316,000 plus the reserve.
- **Well-funded — $462,900 once, $150,000 held, $68,800 a month.** About 50,000 monthly players,
  a top-tier audit, a three-entity structure, a market maker, $25k a month on growth.

Corrections and gaps the orchestrator found: the budgets charge settlement gas at one 200,000-gas
transaction per player-run; the gas probe (`probe/chain/gas/`) measures $0.025–0.07 per
**20-player** run, so that line is about 13× too high (it is small either way). Not priced: taxes
on revenue, insurance, a hardware multisig, geo-blocking or identity checks if counsel requires
them, refunds after an incident, and the operator's own living costs. Widest uncertainty: legal
(10× on opinions, 300× on entity, and it decides whether stock prizes exist at all), audit tier
(8× for the same code), growth (every web3 figure comes from a seller).

**Infrastructure is not the problem.** The loop prototype's simulation costs about 2 µs per tick
— 0.012 % of one core per live run — re-verifies a run by replay in about 12 ms, and writes a
40 KB input log per run (MEASURED, session scratch `loopbench/`). **Paid acquisition cannot pay
back:** a first-time minter costs $50–120 by an ad network's own benchmark (HypeLab, 2026-03-05)
against an $11.80 kit of which the operator keeps nothing; the median mobile game keeps under
1 % of players to day 30 (GameAnalytics 2026 via gamedevreports, 2026-06-04). Growth has to be
organic.

**What can wait for the play test:** audit, contest, bounty, entity, retainer, trademark filing,
commissioned art and audio, RPC, indexer, wallet vendor, token launch, growth spend,
bookkeeping. The stock-prize securities memo waits until drops are switched on. Not deferrable
once contracts are to be written: the lottery opinion, then the audit (CLAUDE.md: one counsel
pass before any payout contract).

## 6. What precedents say about the numbers this design guesses

- **The one-third recycle is in good company.** MEASURED from CCP's monthly economic reports
  (session scratch `mer/eve_mer.py`, four months of 2026): in EVE Online 30 % of the value lost
  in kills dropped as loot and 70 % was destroyed. SOURCED (archived game wiki, 2020–23): Albion
  Online destroys each item with 30 % probability on death and damages the rest; its 2014 alpha
  used 40 %, and its developer wrote that zero destruction would bring "significant item
  inflation" within months and that durability-only loss is gamed by wearing nearly broken gear.
- **The death rate is the exposed number.** MEASURED from RealmEye graveyards (160 players, 91,036
  deaths, 1.43 M dungeon completions; session scratch `rotmg/`): Realm of the Mad God characters
  die once per 16 completed dungeons overall, once per 10 when not fully maxed, once per 71 when
  fully maxed; top-rank accounts die a third as often as mid-rank. The sample is biased (players
  who died in the last 24 hours, public profiles, lifetime ratios, mostly easy dungeons, and RotMG
  has the instant escape this design removes), but the direction is not in doubt: **death rates
  fall with mastery, several-fold, and fall most where the value is highest.** The economy needs
  one run in 7–14 to end in a death and loses minting at one in 20 (SPEC §5).
- **What operators keep.** Cambria sent about 61 of 826 ETH of Season 2 spend to its treasury
  (7–8 %, my division of its own figures) and takes 1.5–1.9 % of wagered volume elsewhere;
  MapleStory Universe's H1 2026 revenue exceeded rewards by about 10 %; Diablo III's auction
  house took 15 %; RuneScape deletes its 2 % trade tax and lives on membership; RotMG sells
  vault and character slots and took $1.68–3.40 per user a month in 2011–12 (Edery,
  2012-02-08). Spend per head in the model ($3.43 a month) is plausible; the head-count is not.
- **Stock prizes exist on this chain today.** MEASURED (DefiLlama): 16 chance-based apps run only
  on RH Chain with $13.6 M in fees since July 2026; three pay random tokenised-stock prizes
  (StockRip, Fake Wall Street, Orchard). SOURCED (https://docs.robinhood.com/rhj/faq): the stock
  tokens are "tokenized debt securities issued by Robinhood Assets (Jersey) Limited" that "may not
  be offered, sold or delivered within the United States to, or for the account or benefit of,
  U.S. Persons", with the restriction enforced at the front end. Inference: a game that sends
  them to winners is the party delivering a security to people it has not identified — a second
  question for counsel beside the lottery one. SOURCED: New York sued Valve on 2026-02-25 over
  paid loot boxes with resellable contents; Austria's Supreme Court held on 2025-12-18 that loot
  boxes inside a skill game are judged with the game. The more the roll is weighted by skilled
  play and the less by dice, the better the design's position — which points the same way as the
  red team's fixes (`docs/red-team.md`).
- **What broke comparable games:** bots and bought identities (MapleStory Universe banned
  640,000 accounts, 37 %, and found verified accounts for sale), a single mispriced item
  (Cambria, $132,093), inflation (Axie), and the casino mode winning (83–87 % of Cambria's 2026
  volume ran through a fishing mini-game). Pirate Nation and Shrapnel are gone or empty.

## 7. Not verified, or first looks only

- An adversarial check of these notes (five skeptics: Pons facts, cost sources, precedent
  measurements, the repair-fee run, the break-even framing) was launched and cut off by the
  session limit; the orchestrator re-ran `population.py --repro`, the Pons factory getters and
  `budgets.py` itself. Every other web figure stands on the agent's single reading of its source.
- The repair-fee result (line (i)) is three seeds on a patched copy; its sensitivity to wallet
  cap and income spread is untested.
- Real spend per delver, demand at any entry price, and how many free players would pay: not
  measured anywhere.
- Growth and churn are not modelled, so "months to break-even" cannot be stated; the budgets
  give cash per month instead.
- The RotMG and EVE measurements rest on community (RealmEye) and CCP data with the caveats
  above; Albion's current trash rate was seen only in archived pages.
- Cambria's treasury share, Axie's fee split, Wolf Game's rules: press figures or search
  snippets, not developer statements.
