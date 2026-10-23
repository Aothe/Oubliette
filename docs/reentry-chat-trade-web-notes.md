# Re-entry after death, chat, and trade — research note

*2026-10-05. Research for Oubliette (SPEC v0.1), one of three parallel notes (dungeons, hub, this
one). Read first: SPEC §2, §3.1–3.7, §4–§7; `docs/red-team.md` A–D; `docs/capital.md` §1, §6 and
Verdict; `docs/chain.md` §2, §4, §5; `docs/bot-resistance.md` (branch `update/bot-resistance`);
`proto/visual/index.html` (the death and extract overlays). Every outside fact carries the URL that
was opened; reasoning about this design is labelled "inference"; what could not be verified is
listed at the end. Fandom wikis (Tarkov, Hades, Valheim, Dead Cells) and wiki.gg were blocked from
this sandbox (402/403), so those games are cited from Wikipedia or from a patch-note report. These
are recommendations, not decisions. Committed 2026-10-22 as the sources behind `docs/reentry.md`
(part A) and `docs/chat-trade.md` (part B).*

## Verdict (plain English, for a time-poor operator)

1. **Re-entry after death is a new wager, never a resume.** The dead kit is burned or pooled and
   nothing rolls back, so the only honest "re-entry" is a fresh, separately signed entry with
   fresh items. The slice's "Mint a fresh set and delve again" button is already the right shape.
2. **v0: re-enter a *new* run, not the same one.** Same-run re-entry is safe only once three red-team
   rules exist in the contract — a death never pays the run it died in, lottery weight by value
   wagered, and a fresh-drop budget counted in *value* destroyed. None is built. Until then, the
   dead go to the entry hall and queue for their friends' next run.
3. **The free re-entry is the unwagered run.** A player who cannot afford a second kit (39 % of
   runner-days are priced out in the v1 model) should still be able to play — a practice run that
   pays nothing tradeable. That is Tarkov's Scav run and it is also SPEC's "fun at $0" rule.
4. **Loadouts need no new contract.** A kit of four equips in one transaction for $0.004, entry is a
   relayed session-key transaction under a cent, and RH Chain supports EIP-7702 batching. A
   "loadout" is a named list of item ids stored off chain plus one batched transaction. A kit NFT
   (ERC-6551) is not worth it: more gas, a contract recipient (red team D3), and the exchange would
   have to list bundles.
5. **Chat: one shard channel, rate-limited, no links, signed by the session key, kept out of the
   public input log.** It does not touch the simulation, so it lives beside the log, not in it.
   Moderation at v0 scale costs almost nothing in tooling (about $2 per 1,000 messages for a hosted
   filter, less for a model call); the real cost is the human who reads reports.
6. **No trade window in v0.** Every trade-window scam in the RotMG list (deselect, look-alike items,
   multi-window, "trust me") is a UI race that the exchange's escrowed offers do not have. Items are
   ERC-721s and can move wallet to wallet anyway; accept that leak in v0 (it is 7.5 % of the burn,
   ~$3 a day per 600 delvers) and close it later with a burn on first equip by a new owner (red
   team E6), not with a transfer allow-list.
7. **Do not try to force all trades through the exchange with a transfer validator in v0.** OpenSea
   gave up enforcing creator fees that way in August 2023 because it needed everyone's buy-in; the
   ERC-721C route works but puts an allow-list key in the operator's hand, against D8.
8. **What persists across death** should be account-side and non-tradeable (RotMG: vault, pets,
   fame; Hades: Darkness; Rogue Legacy: the manor) — never a tradeable prize keyed to it (B4).
9. **Scope:** v0 = new-run re-entry with one click + the unwagered practice run + shard chat +
   the exchange. Next = same-run re-entry before the door seals, named loadouts, targeted offers.
   Later = transfer validators, voice, global chat, a market-city trade floor.
10. **Open numbers to measure in the play test:** time from death to back in a run (target: under
    a minute, RotMG's loop), how many re-enter at all, and whether chat is used or emotes suffice.

## A. Re-entry after death

### A1. What reference games do when you die

| Game | What is lost | What persists | Re-entry | Fits a burned/pooled kit? |
|---|---|---|---|---|
| **Realm of the Mad God** | The character and everything it carried or wore: "Upon death, the player's character is lost along with all of its carried equipment, although the player can store a number of items for safekeeping in a limited-capacity vault away from danger" — https://en.wikipedia.org/wiki/Realm_of_the_Mad_God | The **vault** ("to save them from loss when the character carrying them dies"; 8 slots, +8 for 500 Realm Gold) — https://www.realmeye.com/wiki/vault ; **pets** ("Pets do not disappear when a character dies. They will just return to your Pet Yard") — https://www.realmeye.com/wiki/pets ; **fame** is "a permanent-progression mechanic" spent on cosmetics or pets, and "upon a member's death, guild fame is earned" — Wikipedia, above | A new character at once from the Nexus. The same *dungeon* cannot be rejoined: "All portals stay open for 30 seconds before vanishing" — https://www.realmeye.com/wiki/dungeons | **Yes.** Nothing is returned; what persists is account-side and not the lost gear. This is the model SPEC §3.1 already names. |
| **Escape from Tarkov** | Inventory, "save for those put in a secure container with limited slots or those insured with in-game money, provided no other player has taken the insured items back to their stash" — https://en.wikipedia.org/wiki/Escape_from_Tarkov | Stash, hideout, secure container. Insurance returns gear after 12–36 h only if nobody looted it — https://afkgaming.com/esports/guide/everything-about-insurance-in-escape-from-tarkov | A new raid; a dead PMC cannot rejoin. **Scav runs**: "players are assigned a random loadout instead of having to bring their own equipment. They enter a random raid already in progress … there is a cooldown before the mode becomes available again" — Wikipedia, above | **Insurance and the secure container do not fit** (both undo the loss). **The Scav run fits exactly**: a free, cooldown-limited way back in for a player with nothing to wager. "Found in raid" (B5) fits too. |
| **Diablo II / IV hardcore** | D2: "if you die, your character can no longer be used … You will also lose every item on your character and in your stash. If you have consented another player to loot your body they can recover the items" — https://classic.battle.net/diablo2exp/basics/hardcore.shtml . D4: character gone with "gear, aspects, and anything else … outside of cosmetics", disconnects count as death — https://www.siliconera.com/how-does-hardcore-mode-work-in-diablo-iv/ | Account, cosmetics, ladder rank ("your character will still be ranked") — Arreat Summit, above | A new hardcore character; D2's dead character "cannot create or join games". Friends keep the game open and the new character joins it — inference from "Hardcore characters can only join games with other Hardcore characters" | **Yes**, minus D2's "consent a friend to loot your corpse", which is a transfer of the dead kit to a party-mate — the C1 griefing vector in reverse. Do not copy it. |
| **WoW Classic Hardcore** | "Death on Hardcore realms is permanent on that realm"; the dead "continue to exist in the game world as a ghost to facilitate communication with in-game friends"; griefing "will not be tolerated", with a contract at character creation — https://worldofwarcraft.blizzard.com/en-us/news/23973734/rules-of-engagement-classic-hardcore-is-coming-to-world-of-warcraft (2023-06-28) | Free transfer of the dead character to a normal realm | A new character | **The ghost-who-can-chat is the one idea worth taking**: the dead stay in the party's channel. The transfer-out does not apply. |
| **Hades** | "obols and certain types of upgrades are lost upon death and must be collected anew each time, while other types of currency can be used at the House to purchase permanent upgrades" — https://en.wikipedia.org/wiki/Hades_(video_game) | Darkness, keys, the Mirror of Night | Instantly, from the House | **Yes, as the account layer**: meta-currency that buys permanent non-tradeable progress. |
| **Dark Souls** | "the character returns to the last bonfire and drops any carried souls and humanity at the place of death. The player can recover them by reaching the resulting bloodstain, but loses them permanently after dying again before doing so" — https://en.wikipedia.org/wiki/Dark_Souls_(video_game) | Gear (never lost) | Immediate, with a corpse run | **No.** The corpse run is a rollback; the gear is never at risk. The only piece that fits is the *second* death losing the souls for good — the dead kit here is already gone at the first. |
| **Valheim** | All items drop into a tombstone; 5 % of skill progress; a "No Skill Drain" grace of about ten minutes against death loops — https://primagames.com/tips/valheim-what-happens-when-you-die | Everything, once the tombstone is reached | Respawn and run back | **No** (a corpse run). The *grace period against death loops* is a good idea for the account layer (no fame/level penalty twice in ten minutes), not for gear. |
| **Dead Cells / Rogue Legacy** | Dead Cells: "the player … lose[s] all items and other abilities upon dying"; cells "can only be spent at the end of a dungeon section; if the player dies before then, they lose all collected Cells" — https://en.wikipedia.org/wiki/Dead_Cells . Rogue Legacy: control passes to an heir; gold spent on the manor "passed on to that character's heirs" — https://en.wikipedia.org/wiki/Rogue_Legacy | Permanent upgrades bought with banked currency | Instantly | **Yes, as the account layer** — and Dead Cells' "bank only at the checkpoint" is the same rule as SPEC's recall ("saves what was wagered and none of what was picked up"). |

**Reading (inference).** Only three patterns survive an irreversible on-chain burn: RotMG's
*new character at once with an account layer that is never the gear*, Tarkov's *free re-entry
with nothing to lose* (the Scav run), and the roguelikes' *banked meta-progress*. Everything that
returns the dead gear (insurance, secure container, corpse runs, consent-to-loot) is a rollback and
is out. Everything that gives the dead a tradeable prize for having died (guild fame from deaths,
Valheim-style skill refunds) feeds B4–B6 and is out.

### A2. Same run or new run? Rules that make re-entry safe

**What the design already fixes.** A run is an on-chain object: `openRun(commitment)`, a per-run
entry "signed by the player (a session key, no pop-up): the contract records 'these items are in run
R until time T', and a result may touch only items entered in R" (`docs/red-team.md` D2, D4;
`docs/chain.md` §4 step 2, 70,000–90,000 gas, "under a cent"). Recall is shut from the moment the
boss wakes (SPEC §2). Settlement posts "deaths, the per-item death-split and wear as one root, each
finisher's contribution and value wagered" (`docs/chain.md` §4 step 4). The dead kit's recycled
third goes to a claims table (D3). Nothing in that life-of-a-run says a wallet may enter R twice.

**Against same-run re-entry, as the design stands (inference against the red team):**

- **C1 — survivors profit from shard-mates' deaths.** If the dead can come straight back into the
  same run, a party that holds most of a shard has a cheaper way to farm strangers: the stranger
  who dies is encouraged to re-buy and re-enter the same hostile shard. The fix the red team
  names — "a death never pays the run it happened in" (rule 3; each dead kit raffled among
  finishers of *other* runs in the hour before) — removes the motive regardless of re-entry. **So
  the prompt's idea that the dead player's recycled gear goes to the pool of *that* run is the
  wrong way round**: it is exactly what C1 and B7/B8 forbid. Re-entry does not change where the
  dead kit goes; rule 3 does.
- **C2 — one delver's step shuts recall for twenty.** The red team's fix is "a door that seals — a
  ready plate with a short timer; anyone not on it is recalled with wager and no loot; the boss
  scales to the number inside; no late entry." A re-entrant *is* a late entrant. Same-run
  re-entry is therefore consistent only **before the seal**, through the entry hall, and never
  into the boss chamber.
- **C3 — a disconnect is a death that pays the living.** Re-entry does not undo the death; it lets
  the victim re-wager. Under the tick-pause rule (chain.md §4 failure rules) a mass disconnect
  pauses the run, so re-entry is not the remedy for C3 and must not be sold as one.
- **The lottery (B1–B3).** Weight = contribution bar × value wagered, with level never in a
  tradeable roll. A re-entrant's second kit is a second wager: its contribution counts from the
  second entry and its weight from the second kit's mint value. A wallet with two entries (one
  dead, one alive) must be two *entry records*, not one wallet row, or the dead wager leaks weight
  into the live one. Settlement already stores "20 × (address, weight, wager, flags)" — an entry
  id in place of the address costs nothing extra (inference; `docs/chain.md` §4 data per run).
- **Griefing: die on purpose to feed the pool, re-enter, repeat.** At `s = ⅓` a deliberate death
  burns two thirds of the kit and pools one third, so feeding is a loss on the recycled part even
  if the feeder's own party wins the raffle. The danger is the **fresh-drop budget**: as measured
  (`sim/treadmill.py`, SPEC §5) it is "fresh drops a day ≤ b × *items* destroyed by death over the
  previous 30 days ÷ 30" — counted in items. Destroying cheap tier-1 kits on purpose then raises
  the budget for fresh tier-2/3 drops ($39–$129 each, `docs/red-team.md` header constants) that
  the same organised party is best placed to win. The red team already says "count value
  destroyed, not heads"; `CLAUDE.md`'s guardrail says the same. **Same-run re-entry makes this
  attack cheaper to run (no re-queue, no shard change), so a value-weighted budget must be in the
  contract before same-run re-entry ships.** The value-weighted budget is open (red team research
  agenda 1: "a value-weighted budget").
- **Cost per re-entry.** A tier-1 kit is $11.80 in the model (`docs/capital.md` §3, §4; red team:
  "tier-1 gear 120 token + 0.002 ETH ≈ $12"); gas is negligible — mint $0.007–0.008 an item,
  equip a kit of four $0.004, entry under a cent (`docs/chain.md` §2). In the v1 model "39 % of
  runner-days [are] priced out" at the reference cell (SPEC §5), so a second kit in the same
  session is beyond a large share of players. Re-entry policy cannot assume the dead can pay.

**What re-entry buys.** RotMG's retention loop is death → Nexus → new character → back in a realm
in well under a minute (the portals-close-in-30-s rule means the *dungeon* is lost but the
*realm* is not — https://www.realmeye.com/wiki/dungeons). D2 hardcore lets a new character join the
friends' open game. The social reason to allow same-run re-entry is real: a party of friends keeps
playing together. The economic reason is also real: more runs per hour means more mints, and mint
ETH is what funds the piñata (SPEC §5 treadmill row: "what dies is minting, not the burn").

**Proposed rules, in order of when they can exist:**

1. **Re-entry is always a new wager with its own signed entry** (new item ids, a new entry id,
   the same run id or a new one). The first kit stays locked in R until settlement (D4); the
   second is independent. No rule may read "the same wallet died earlier in R" for anything but
   statistics.
2. **v0: new run only.** The dead player returns to the entry hall with one button ("Mint a fresh
   set and delve again", already in the slice) and a **party queue**: the next run their friends
   open is joined automatically. Dead players stay in the shard's chat channel as ghosts (WoW
   Hardcore's one good idea) and watch the **delayed** spectator feed, not a live one — the
   bot-resistance note's "delay the spectator feed, or it becomes a radar" applies to a ghost who
   can call positions to the living (inference; small in PvE, free to avoid in v0).
3. **The unwagered run.** A dead player with no kit may re-enter at once with nothing wagered:
   no loot, no lottery ticket, no fame that feeds any roll — "nothing tradeable for a run with
   nothing at stake" (`docs/bot-resistance.md` v0 rec 5). This is the Scav run without the random
   loadout and it is how "fun at $0" is kept true for the priced-out 39 %.
4. **Next: same-run re-entry before the seal**, only through the entry hall, only while the boss
   sleeps, capped at one re-entry per wallet per run and at the shard's seat cap; the boss scales
   to entrants at the seal (C2 fix); the re-entrant's contribution and weight count from the
   second entry. Preconditions in the contract: rule 3 (a death never pays its own run), value
   weighting (B1), and a fresh-drop budget in value, not items.
5. **Never** re-entry into a woken boss, re-entry that moves a dead kit's loot to the same run,
   or a fee-free "practice" that drops anything tradeable.

### A3. Loadouts: one-click re-equip, gas and time, a kit NFT

**References.** RotMG has no loadout system (claim from memory; not verifiable from a page that
says so — see Could not verify). Destiny 2 added Loadouts with Lightfall (2023-02-28): "This system
lets players save entire builds and switch between them on the fly. Initially, only six will be
available, but another four can be unlocked" — https://www.shacknews.com/article/134375/unlock-loadouts-destiny-2 .
Tarkov's weapon presets could not be read (fandom blocked).

**What the chain already gives.** Equip is "a lock flag, never an escrow move" (`docs/chain.md`
§4); "equip 1 item / a kit of 4 — 29,704 / 47,329 gas — $0.003 / $0.004" (`docs/chain.md` §2, live-
validated); entry "one transaction, relayed so there is no pop-up" by a session key (§4 step 2);
and the chain "supports EIP-7702" (`docs/chain.md` §1 census table; Robinhood's own account-
abstraction page is cited there), so an ordinary wallet can batch equip + entry into one signed
operation. Blocks are ~0.1 s. **So a one-click re-entry costs under two cents of gas and a second
of time; the only friction is the wallet pop-up for the equip, which 7702 batching or a
pre-equipped standby kit removes.**

**What "equip on chain is the wager" means for one click (inference).** SPEC §3.5 says gear is at
risk "only when on-chain-equipped"; `docs/chain.md` §4 narrows that: settlement "may change only
items locked into a run it opened". An equipped-but-not-entered kit is therefore not at risk from
settlement; its only cost is that it cannot be listed while locked. A **standby kit** — equipped
at the start of the session, entered only when the player clicks — makes re-entry one relayed
transaction with no pop-up. The exposure the red team priced (D2: "a kit is then exposed 0.2 % of
the time instead of always") is unchanged, because exposure is per entry, not per equip.

**Is a vault-side kit NFT worth it?** ERC-6551 "assigns Ethereum accounts to all non-fungible
tokens. These token bound accounts allow NFTs to own assets" (status: review) —
https://eips.ethereum.org/EIPS/eip-6551 . For this design it costs more than it gives (inference):
a contract account per kit is a contract *recipient*, which D3 forbids inside settlement and
matching; the exchange lists items, not bundles, and the per-item durability/wear root (lazy wear,
`docs/chain.md` §5) is per item; and the batched equip already does the job for $0.004. **A
loadout is a named list of item ids stored by the client or server, plus one batched
transaction.** Six to ten named slots (Destiny's number) is a UI decision, not a contract one.

**Not measured:** a single `mintKit` call (the probe mints one item per transaction, 76,649–93,737
gas; four mints plus an equip in one 7702 batch should land near 350,000 gas, about $0.03 —
inference from the per-action numbers, not run).

## B. Chat and trade

### B4. Chat

**RotMG.** "Player and NPC chat appears in the lower left corner of the screen"; guilds have a
private guild chat "which players outside the guild cannot see"; the Nexus "marketplace" is where
"players commonly use this area to trade with other players" —
https://en.wikipedia.org/wiki/Realm_of_the_Mad_God . What went wrong is forum-level evidence only:
"i still see a bunch of RWT bots" (Steam thread, 2023-10-04) —
https://steamcommunity.com/app/200210/discussions/0/3809533595067031143/ ; Deca reports bans
("we have permanently banned over 700 accounts") in the 2026 team letter cited in
`docs/bot-resistance.md` — https://hub.realmofthemadgod.com/news0/news1/2026-team-letter . The
2025 team letter says nothing about chat, spam or moderation —
https://remaster.realmofthemadgod.com/?p=4428 . No official post describing a chat gate (rank,
level or email verification) was found; see Could not verify. The scams that run *through* chat
are the trade-window ones in B5.

**Blockchain games.** The threat is not spam but the link: "Wallet Drainer is a type of malware
deployed on phishing websites that steals crypto assets by inducing users to sign malicious
transactions. In 2024, such attacks caused approximately $494 million in losses, a 67 % increase
year-over-year … 332,000 addresses" — Scam Sniffer,
https://drops.scamsniffer.io/scam-sniffer-2024-web3-phishing-attacks-wallet-drainers-drain-494-million/ .
Compromised Discords are a named vector: "On May 31st, 2023, Pika Protocol's Discord was hacked. A phishing website, deployed by Pink Drainer, was disseminated within its official Discord group" —
https://blocksec.com/blog/demystifying-hacking-incidents-by-drainers . Wallet-signed identity is a
finished standard: EIP-4361 Sign-In with Ethereum, "Ethereum accounts can authenticate with
off-chain services by signing a standardized message format", status Final —
https://eips.ethereum.org/EIPS/eip-4361 . Inference for this design: the session key the player
already authorises at entry (D6) is the chat identity — every message is signed, so a report is
verifiable and a ban sticks to the wallet; **no URLs in chat, ever, and nothing in the client that
asks the wallet to sign from a chat context**, because the only chat attack that matters is the
one that ends in a signature.

**Moderation cost.** A hosted filter is "$2.00 per 1,000" messages pay-as-you-go —
https://getstream.io/moderation/pricing ; a first-pass model call is $0.00003–$0.00275 a message
depending on the model — https://aicostcheck.com/blog/ai-content-moderation-costs-2026 ; voice
moderation (ToxMod) starts at $5,000 a month for 50,000 hours —
https://www.modulate.ai/pricing . At v0's one shard of ~20, a few thousand messages a day is
under $10 a month of tooling; the cost is a person reading reports, which the bot-resistance note
already budgets for ("human review"). Inference.

**Must chat be in the deterministic input log?** No. SPEC §3.4 logs "every input" so that "anyone
replays the input log through the same simulation and gets the same deaths and the same drops";
chat changes no state, so it must not be an input. `docs/chain.md` §4 already lists chat under
"Deliberately not on chain". Two further reasons to keep it *beside* the log (inference): the log
is "public before loot can be sold" (D6), and publishing party chat with it would leak private
talk and make the log the spam archive; and the 27 KB-per-run log budget is for replay, not
retention. **Recommended shape:** a second stream signed by the same session key with its own hash
chain, retained privately for a fixed period for moderation, never published, never replayed. The
Age of Empires lockstep paper does not say how chat was carried, so no precedent is cited —
https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond .

**What a minimal v0 chat needs (inference):** one **shard channel** (one shard of ~20 is one
room), a hall channel for the entry hall, ghosts stay in the channel after death; **no global, no
whispers** in v0 (whispers are the scam DM — the RotMG scam guide's "private message you a big blob
of text to distract you"); a rate limit (one message a second or slower), a line length cap, a
link filter that drops anything URL-shaped, client-side mute and ignore, and a report button that
attaches the signed messages. A canned-callout set (four to eight phrases plus a map ping) covers
most co-op communication and ships with no moderation at all; whether players need free text is a
play-test question, not a design one.

### B5. Trade: window vs exchange

**RotMG's trade window and its scams.** Items can be soulbound: "Items that are soulbound cannot
be traded" — https://www.realmeye.com/wiki/trading . The scams are UI races, in a player's own
list: "Deselect: most basic technique in which a player unclicks his offer, making you give him
goods for free. Some players will also private message you a big blob of text to distract you";
"Similar items … (para hp vs exa hp, wis vs life)"; "Trust"; "Multi-window Trade … Scammers will
ask for some of your payments first, then just leave"; "Key Popper" —
https://www.realmeye.com/forum/t/a-beginner-guide-to-common-scam-techniques/37197 . Diablo II's
window has the same two-accept shape: "The trade is completed when both parties have accepted.
Either party may cancel the trade at any time" —
https://classic.battle.net/diablo2exp/basics/trading.shtml . Inference: every one of these is
removed by an escrowed offer — the item and the price are fixed when the offer is placed, the fill
is atomic, and there is no second window.

**OSRS: removing and restoring free trade.** Jagex removed unbalanced trade on 10 December 2007
expressly against real-world trading: "To remove real-world trading from RuneScape, we must stop
the gold sellers' ability to function. We believe that the best and only way to do this will be to
stop unbalanced trade … the total value of the items being given must be within 3,000gp of the
items being received … You won't be forced to use the Grand Exchange to trade either" — and it
changed death drops and dropped-item visibility for the same reason —
https://runescape.wiki/w/Update:Trade_and_Drop_Changes . The referendum closed on 14 January 2011
"with well over 1.2 million votes … with 91 % of the vote, you've told us loudly and clearly that
you support the restoration of free trade and the Wilderness" —
https://runescape.wiki/w/Update:RuneScape_Referendum:_Voting_Closed ; free trade returned on
1 February 2011, and a 25,000-coin-a-day limit for never-member accounts was added on 22 November
2011 "to combat Gold farming" — https://runescape.wiki/w/Trade_limit . What the restriction did to
RWT: "most of the various real-world trading companies began requesting the customer's account,
password, and bank PIN, and then farm the gold on the customer's account" —
https://runescape.wiki/w/RWT . **Lesson:** cutting direct trade moved RWT, cost three years of
goodwill, and the GE existed the whole time beside it. Here RMT is sanctioned by design
(`docs/bot-resistance.md`: "Real-money trading as such. It is the design"), so the OSRS reason
to restrict trade does not exist; only fee evasion remains.

**Tarkov's flea market.** From the 2020-05-27 patch: "Now you can't sell items that were not found
in raid on the flea market. This rule will not apply to weapons" —
https://www.dexerto.com/escape-from-tarkov/escape-from-tarkov-may-28-update-patch-notes-scav-flea-market-changes-1371902/ .
A provenance gate on *listing*, not on trade: the market stays, what may be listed is restricted.
The design's analogue is already proposed — a vesting window on boss drops pending replay checks
(`docs/bot-resistance.md` §4) and "only repaired gear lists" (red team E5).

**Items are NFTs and move wallet to wallet anyway.** OpenSea stopped enforcing creator fees on
31 August 2023: the Operator Filter "required the buy-in of everyone in the web3 ecosystem, and
unfortunately that has not happened" —
https://www.theblock.co/post/246095/opensea-disables-royalty-enforcement-tool-makes-creator-fees-optional .
The enforcement route that survives is a transfer validator: Limit Break's ERC-721C "adding
creator-definable transfer security profiles that are the foundation for enforceable,
programmable royalties" — https://github.com/limitbreakinc/creator-token-standards (README) —
under which transfers outside approved venues revert. Red team E6 sizes the leak: off-exchange
swaps skip a fee that is "7.5 % of the burn (about $3 a day per 600 delvers)", and recommends
"a fixed burn the first time a new owner equips an item it did not mint or win — and cut the
exchange's own fee toward zero so it wins on convenience".

**What an in-game direct trade adds, and what it costs (inference).** Gifts and friend-to-friend
sales at a price the book would not print. With escrowed on-chain offers ($0.006 to place, $0.006
to fill — `docs/chain.md` §2) a "direct trade" is just a **targeted offer**: an offer only one
named wallet can fill. Same escrow, same burned fee, same atomic fill, no window. Its one cost is
to the price history — E4 wants "strict price-then-time matching with open offers only, no private
fills", so targeted fills must be excluded from the published price. A trade window would add a
second code path on chain, the RotMG scam list, and no fee the exchange does not already take.

**Proposed v0 rule.** No trade window. All in-game trade is the exchange (open offers). Wallet-to-
wallet ERC-721 transfers stay possible and fee-free in v0 — the bot-resistance note's open
decision 6 ("whether gear transfers are restricted to the exchange, or the burned fee is accepted
as optional") is answered *optional* for v0, because the leak is ~$3 a day at 600 delvers and the
fix (burn on first equip by a new owner) changes who pays and needs the fee sim rerun (E6).
Transferred-in gear should be flagged as such for the forensics rig (SPEC §3.7 "A1 listing-
forensics rig … from day one"). Soulbound-while-locked already follows from the `inRun` flag.

### B6. Scope: v0 / not-v0

SPEC §7 v0 is "one shard (~20 players) … a minimal offer-based exchange … browser client". Against
that line:

- **In v0:** one-click re-entry into a *new* run with a fresh kit (exists in the slice); the party
  queue to rejoin friends' next run; the unwagered practice run; ghosts in the shard channel; one
  shard channel plus a hall channel with rate limit, link filter, report; the exchange as the only
  in-game trade; wallet-to-wallet transfers unrestricted.
- **Next (after the three contract rules land):** same-run re-entry before the seal; named
  loadouts with 7702 batching and a standby kit; targeted offers excluded from price history; the
  burn on first equip by a new owner with the exchange fee cut toward zero.
- **Later / not-v0:** transfer validators (ERC-721C-style) if the leak ever matters; whispers,
  global chat, voice; a trade floor in the market city (SPEC §3.7, not v0); kit NFTs (not
  recommended at all).

## Recommendations

**v0**
1. Re-entry = new run, new kit, new signed entry; keep the slice's one button. Measure
   death-to-next-run time in the thirty-run play test (target under a minute).
2. Add the unwagered run: no wager, no loot, no lottery, no fame into any roll. It is the $0 loop.
3. Ghosts: the dead stay in the shard's chat and see the delayed feed; they are queued for the
   party's next run.
4. Chat: shard + hall channels, signed by the session key, rate-limited, URL-free, no whispers,
   kept beside (not in) the input log and never published. Try canned callouts first.
5. Trade: exchange only; no window; transfers off-exchange allowed and flagged.
6. Write into the SPEC that "equip = at risk" is refined by "settlement touches only items entered
   into that run", so a standby kit is a defined, safe state.

**Next**
7. Same-run re-entry before the seal, as a new entry record, capped, with the boss scaled at the
   seal — only after (a) a death never pays its own run, (b) value-weighted lottery, (c) a fresh-
   drop budget in value destroyed. Add "deliberate cheap deaths under same-run re-entry" to the
   treadmill sim as a probe.
8. Loadouts: named kits off chain, one batched equip, a standby kit pre-equipped per session.
   Measure a batched mint-and-equip in `probe/chain/gas`.
9. Targeted offers; the first-equip burn; rerun the fee cells of `sim/economy2.py` with the burn
   moved.

**Later**
10. A transfer validator only if measured off-exchange volume exceeds what the first-equip burn
    recovers; voice and global chat only with a moderation budget; the market-city trade floor.

## Could not verify

- **RotMG chat gating** (any rank, level, fame or email-verification requirement to talk) — no
  official or wiki page found; the RealmEye wiki pages `chat`, `chat-commands`, `communication`,
  `account`, `scams`, `fame` return 404 and `death` was deleted in 2015. The claim that RotMG has
  no loadout system is from memory.
- **RotMG trade-window countdown or rank requirement** — not found; the scam list is one 2018-09-16
  forum post (date from the Discourse thread JSON), not an operator statement.
- **Tarkov specifics** beyond Wikipedia and one patch-note report: insurance return windows and
  "cannot insure secure containers" come from a guide site
  (https://afkgaming.com/esports/guide/everything-about-insurance-in-escape-from-tarkov); Scav
  cooldown length; whether the found-in-raid rule was later relaxed; weapon presets; the
  reconnect-after-disconnect window (search snippets only, no primary page).
- **Hades, Valheim, Dead Cells, Dark Souls**: fandom and wiki.gg blocked (402/403); cited from
  Wikipedia and, for Valheim, a guide site. Hades' Mirror of Night details were not read.
- **Diablo IV hardcore**: from a guide site, not Blizzard's support page (the support page is a
  JavaScript shell with no text when fetched).
- **Destiny 2 loadouts**: Bungie's own pages returned a JS shell / 403; cited from Shacknews
  (2023-02-28).
- **ERC-721C adoption by OpenSea and Magic Eden**: search-result summaries only; the Limit Break
  README was read, the OpenSea help page was not.
- **The cost of a batched mint-and-equip** and **an entry record per re-entry**: inferred from the
  per-action gas table, not measured.
- **Whether a live ghost camera harms a PvE shard**: inference from the bot-resistance note's
  radar argument; no test.
- **Every design rule above**: reasoning from SPEC §2–§7, `docs/red-team.md` and `docs/chain.md`;
  none simulated or play-tested.
