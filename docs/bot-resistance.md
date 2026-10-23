# Bot resistance: what real games show, and what this design needs

*SPEC §4 called this "open, and serious". Web research, 2026-10-02. Every fact has its source
beside it. Reasoning about this design is labelled as inference — none of it is simulated. What
could not be verified is listed at the end. These are recommendations, not decisions.*

## Verdict

**The threats that matter, in order:**

1. **Death-avoidance automation** (auto-escape, auto-dodge). Death is the item sink, so a cheat
   that removes death removes the economy. It needs only what the client legitimately shows, so
   "clients are renderers" does not stop it.
2. **The on-chain dupe** — a bug or stolen key in whatever mints boss drops or settles deaths.
   Rare, and terminal, because nothing on chain can be rolled back.
3. **Many wallets farming anything paid per head or paid for free.** The "top five or ten share
   a dice roll" rule in SPEC §3.5 is the exposed part.
4. **Bans with no teeth.** A banned cheater keeps loot already sold and moves gear to a fresh
   wallet.

**Overrated:**

- **Exchange bots** (sniping, flipping). They are the merchant loop, and they pay the burned fee.
- **Real-money trading as such.** It is the design. What is left is fee evasion and theft.
- **A bot that merely plays as well as a person.** It pays the same mint, repair and death costs,
  so it is a customer.

## 1. Death-avoidance automation

**Evidence.**
- The tools exist today for RotMG's current client: an open-source suite lists "Autonexus",
  "WASD Autododge", "Cursor Autoaim", pathfinding, autoloot and "Auto Kill Gods", with a prebuilt
  copy sold for $2 — https://github.com/Evergreen-Techworks/realm-engine-client
- The Flash-era proxies had the same features as plugins —
  https://github.com/thomas-crane/KRelay
- Where a server trusts the client it is worse: a private-server proxy offers godmode, speed and
  "predictive autonexus" — https://github.com/swrlly/vrelay
- Deca reported a detector only in 2026: "The autododge detection system is now active" —
  https://hub.realmofthemadgod.com/news0/news1/2026-team-letter
- SPEC §5 (v1): minting dies at `d0` 0.05 for `s ≥ ⅓`. *Inference:* if automation halves the
  population's death rate, the token sink stops.

**Cheapest defences.**
- **No free, instant escape.** Leaving takes a few seconds under fire, or happens only at exits.
  That turns auto-escape from "never die" into a small edge. Cost: players lose RotMG's panic
  button. The slice tests exactly this (a three-second recall that any hit breaks, SPEC §2).
- **Budget fresh drops against gear actually destroyed** over a trailing window rather than a
  fixed chance per run, so `(1 − s)·deaths > fresh` holds by construction whoever is cheating.
  Cost to players: none. *Inference, untested — needs a sim run.*
- **Per-wallet survival and timing statistics from the input log**, feeding human review. Never
  auto-ban: honest experts will be flagged.

## 2. The on-chain dupe

RotMG's dupes were database races. Here the chain owns the items, so that class is gone. The
equivalents are a compromised or buggy drop-minter, unequipping or transferring gear mid-run
before the death is settled, and disconnecting to dodge settlement. RotMG's operators could take
the game down, delete items, or make everything untradeable. A chain cannot undo a sale.

**Evidence.**
- Gala Games, May 2024: a compromised minting wallet created 5 billion GALA (about $240M
  nominal); 600M were sold for about $22M in 45 minutes before a blocklist stopped it —
  https://decrypt.co/231698/gala-games-attacker-returns-ethereum-240-million-exploit
- RotMG's own dupe history: the dated table below.

**Cheapest defences.**
- **Hard caps in the contract.** Recycled drops can come only from gear that actually died; fresh
  drops are capped per period. A stolen server key can then mint at most the cap.
- **Lock gear on chain from equip until a signed run result.** A disconnect is not an escape.
- **Resume a crashed shard from its input log** rather than voiding the runs — determinism makes
  this possible.

## 3. Multi-wallet farming

**Evidence.**
- Axie banned 18,505 axies for one person playing on many accounts (Nov 2021, reporting of
  official posts) — https://bitpinas.com/play-to-earn/42000-axies-banned-update/
- Axie removed token rewards from its free single-player mode, about 40 % of issuance (Feb 2022)
  — https://decrypt.co/92190/axie-infinity-making-big-changes-to-fix-its-ailing-play-to-earn-nft-economy
- Jagex bans about 67,000 Old School RuneScape accounts a week: "as fast as we ban them, new bots
  are made" (Feb 2024) —
  https://oldschool.runescape.wiki/w/Update:Bots,_Bans_and_Appeals:_An_Update

**Against this design** *(inference)*. A lottery weighted linearly by damage dealt gives a
splitter no edge: ten wallets doing a tenth each get the same total, and each pays its own mint,
repair and death risk. The exposed parts are an equal share among the "top five or ten", any
ticket just for finishing, any reward for a run with nothing at stake, and any per-wallet cap.
All of those reward splitting.

**Cheapest defences.** Weight every roll, the big one included, by contribution. Give nothing
tradeable for a run with no gear at risk. Put caps on the item (durability already does), never
on the wallet. SPEC §5 (v1, D) already shows weighting changes who gets loot, not stability.

## 4. Bans with no teeth

Jagex and CCP confiscate; on chain the loot is already sold. CCP banned 70,492 accounts in 2021
— https://www.eveonline.com/news/view/team-security-2021-in-review

**Cheapest defences.** A short vesting window on boss drops pending replay checks (cost: a delay
before selling a drop). Non-transferable account progression that gates the big rolls, so a
wallet is costly to replace (cost: newcomers wait). Escape from Tarkov is the precedent for
restricting market access by provenance: since May 2020 items not "found in raid" cannot be
listed — https://www.dexerto.com/escape-from-tarkov/escape-from-tarkov-may-28-update-patch-notes-scav-flea-market-changes-1371902/

## Why the overrated ones are overrated

- **Exchange bots.** Path of Exile's fear was that "a few trade bots with access to a fast trade
  system" would damage the economy (Chris Wilson, Nov 2017) —
  https://www.pathofexile.com/forum/view-thread/2025870. Here fast trade is the product, offers
  are escrowed, and every wash trade burns a fee. It becomes harmful only if something pays out
  on volume or last price. Never build that.
- **Real-money trading.** CCP's complaint is the crime around it — "account hacking, credit card
  fraud, client modification" — with PLEX as "a legal way" (Apr 2014) —
  https://www.eveonline.com/news/view/this-is-team-security. Jagex's bonds blog said "well over
  40% of active players have bought gold" from third parties (Sep 2013) —
  https://runescape.wiki/w/Update:Blog_-_An_outline_of_the_impact_of_RuneScape_Bonds. The demand
  is real and this design serves it directly. What is left is trading off-exchange to skip the
  burned fee, wallet theft, and paid carries.

## What RotMG teaches

| When | What happened | Source |
|---|---|---|
| Jun–Oct 2012 | Kabam took over "during the height of a widespread item duplication exploit that devastated the player-run economy" | community wiki: https://www.realmeye.com/wiki/kabam |
| Nov 2012, Mar 2013 | More dupes; "all items were temporarily made soulbound"; untiered items stayed untradeable until Aug 2021. The cure for dupes was to switch off trading | same page |
| Oct 2016 | Three months into Deca's ownership the game was taken offline over items "disappearing or being duplicated" | player relay of Deca's notice: https://steamcommunity.com/app/200210/discussions/0/341537671984395281 |
| Dec 2019 | Deca on the Unity client: "One of the biggest changes will be to the security of the client and our backend" | https://remaster.realmofthemadgod.com/?p=459 |
| Jul 2020 | Exalt (Unity) released; Flash discontinued that September | https://en.wikipedia.org/wiki/Realm_of_the_Mad_God |
| Mar 2026 | Deca banned 81 main accounts in four waves for "cheating and duping". Duping survived the rewrite | https://remaster.realmofthemadgod.com/?p=5811 |
| 2026 | "We have permanently banned over 700 accounts" since a May terms update; autododge detection "now active" | https://hub.realmofthemadgod.com/news0/news1/2026-team-letter |

The lesson: a new client bought a few quiet years, not a fix. What Deca reached after ten years
is statistical detection plus manual review — which the input log gives this design on day one.

## What the input log makes possible, and where it stops

**Possible.**
- **Cheats that cannot exist.** Godmode, speed and walking through walls need a server that
  trusts the client. This one does not.
- **Less to see.** Send each client only what is in view; delay the spectator feed, or it
  becomes a radar.
- **Replay statistics per wallet**: reaction-time distributions, how closely inputs match an
  optimal dodger, escapes fired at one fixed health level, hours played without a break.
  Server-side movement analysis catching scripts is established research —
  https://www.eurecom.fr/publication/2860/download/rs-publi-2860.pdf
- **Machine flagging with human jurors.** Valve's replay model convicts "80 to 95 percent of the
  time" against 15–30 % for player reports, with people making the call (GDC 2018, via PC Gamer)
  — https://www.pcgamer.com/vacnet-csgo

**Limits.**
- A cheat slowed and jittered to look human cannot be told from a human. But it then dies about
  as often as one, so the sink is intact.
- The harm that remains is to people, not the item count: tireless human-grade bots take a share
  of the loot their operators' labour did not earn, and fill shards with non-players. Entry cost
  and contribution weighting leave them no per-run edge. Nothing removes them.
- Published replays are training data for bot-makers. Keep the detectors private even though the
  simulation is public.

**A gap in SPEC §3.4** *(inference)*. Per-tick randomness from public block hashes is readable by
a bot as soon as the server reads it. Mix in a server secret committed at run start and revealed
afterwards, and roll loot from a block hash that did not exist when the last input was accepted.

## Recommendations

**v0 (the one-dungeon slice):**
1. Decide and play-test the escape rule: no free instant exit.
2. Lock gear from equip until signed settlement. A disconnect or crash is never an escape.
3. Send each client only what is in view.
4. A committed server secret plus a post-input block hash for randomness.
5. Weight all loot linearly by contribution; nothing tradeable for a run with nothing at stake.
6. Record human baselines from play tests: reaction times and deaths per run.

**Before real value is at stake:**
1. Contract-level caps on drop minting; recycled drops only from dead gear.
2. The fresh-drops-budgeted-to-destruction rule, tested in a v2 sim alongside a deathless-cheater
   fraction and a multi-wallet agent.
3. A drop vesting window with published rules.
4. Non-transferable account progression gating the big rolls.
5. Per-wallet flags with human review.
6. A decision on whether gear transfers are restricted to the exchange, or the burned fee is
   accepted as optional.

**Later:** a trained replay classifier with human jurors; independent replayers and bonded
entry; exchange forensics, needed only if anything ever keys off volume.

## Not verified, or forum-only

- What the original studio (Wild Shadow, 2011–12) did about cheating: nothing found.
- Botted farming of potions for real-money sale in RotMG: unsourced beyond one forum post.
- Deca treating multiboxing and tracker tools as bannable: forum posts only; no official rules
  page found.
- What Exalt's anti-cheat technically changed: nothing beyond Deca's one sentence.
- The 2012–13 dupe details come from a community wiki, not operator statements.
- The date of Deca's team letter is inferred from its contents (2026).
- Super Sushi Samurai's March 2024 self-transfer bug ($4.6M) and OpenSea ending creator-fee
  enforcement (Aug 2023) were seen in search results only; the pages were not opened.
- Tarkov's reason for "found in raid", Path of Exile price-fixing, and the measured effect of
  RuneScape bonds on gold farming: no primary source found.
- Every design inference above (the fresh-drop budget, linear weighting, vesting, the randomness
  secret, "a halved death rate stops minting") is reasoning from SPEC §3–5. None is simulated.
