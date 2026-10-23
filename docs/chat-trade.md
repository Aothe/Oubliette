# Player interaction: a chatbox, and player-to-player trade

*Synthesis of `docs/reentry-chat-trade-web-notes.md` part B (sourced) against SPEC §2, §3.7, §7
and `docs/red-team.md`. Written 2026-10-05 as a proposal; the operator's decisions on it
(2026-10-20) are at the end and in SPEC §2 — they replace the channel set in point 1 below.*

## The short version

1. **Chat: one shard channel and a hall channel, nothing global, in v0.** Messages are signed by
   the session key the player already has (the sign-in-with-wallet pattern), rate-limited, with
   links stripped. No whispers. Try canned call-outs first ("boss", "help", "going in", "leaving")
   and add free text only if the play test wants it.
2. **Chat lives beside the input log, never in it.** It changes no simulation state, so it does
   not belong in the replay; and because the log is public before loot can be sold (red team
   rule 8), putting chat in it would publish every conversation. `docs/chain.md` already keeps
   chat off chain.
3. **The one chat attack that matters ends in a wallet signature.** Wallet-drainer phishing took
   about $494 million from 332,000 addresses in 2024 (Scam Sniffer). No links in chat, and
   nothing in the game ever asks for a signature from inside a message. Everything else —
   spam, abuse — is a moderation cost: tooling is about $2 per thousand messages for a hosted
   filter and less with a model call; the real cost is the person who reads reports.
4. **No trade window in v0.** Every scam in RotMG's trade-window history — the deselect trick,
   look-alike items, the multi-window swap, "trust me" — is a race in a two-sided UI that the
   exchange's escrowed offers simply do not have. OSRS removed free trade in December 2007 to
   fight real-money trading and restored it in February 2011 after a referendum; the RMT just
   moved. Here RMT is sanctioned by design, so a trade window would add a scam surface and
   remove a burned fee, for nothing the exchange does not already do.
5. **Items can move wallet to wallet anyway. Accept the leak in v0.** An off-exchange transfer
   skips the burned fee; the red team sized it at about 7.5 % of the burn, around $3 a day per
   600 delvers at the model's scale. Close it later with a burn on first equip by a new owner,
   not with a transfer allow-list: OpenSea abandoned fee enforcement by allow-list in August
   2023 because it needed every marketplace's buy-in, and an allow-list key in the operator's
   hand is against the red team's D8.
6. **"Direct trade" later means a targeted offer** on the same exchange — an offer only one
   wallet can take, with the same escrow and the same fee, excluded from price history so it
   cannot be used to paint the chart.
7. **Gifts are wallet transfers** outside the game, and that is fine.

## Why the exchange is the trade feature

SPEC §3.7 already makes trade a product: offers matched by the contract, escrowed listings, a
burned fee, public price history. `docs/chain.md` §5 recommends the on-chain book for v0 — a
placement costs about $0.006 and price history comes free. The merchant loop (SPEC §3.1) needs
"price history, volume, item information, and events that move prices", and every one of those
is a property of a book, not of a window. A window would split liquidity and hide prices.

## What RotMG and OSRS teach

- RotMG never had an in-game market; its market is a fan site (RealmEye's trading offers), and
  its trade window is a documented scam list. Players who want to trade safely use the fan
  site and a trusted middleman.
- OSRS's Grand Exchange replaced shouting in a public square with matched offers; what moved
  off the trade floor was the spam. The GE also has a four-hour buy limit per item against
  manipulation and a cap on open offers per player — two rules SPEC §3.7 does not yet name and
  the first city's Reliquary should.

## Bins

- **v0:** shard and hall chat, signed, rate-limited, no links, kept beside the log and never
  published; canned call-outs first; exchange only; off-exchange transfers allowed and flagged
  by the forensics rig.
- **Next:** targeted offers; the first-equip burn (re-run the fee cells of `sim/economy2.py`
  with the burn moved); a buy limit and an open-offer cap written into §3.7.
- **Later:** a transfer validator only if measured off-exchange volume exceeds what the
  first-equip burn recovers; voice and global chat only with a moderation budget; the market
  city's trade floor as a place (see `hub.md`).

## Decisions this asks of the operator

1. v0 ships with no trade window — trade is the exchange, gifts are wallet transfers. Agree?
2. Chat in v0: canned call-outs only, or free text in the shard channel from day one?
3. The dead's handle on the Roll (see `hub.md`) is the same handle chat uses — a chosen name
   bound to the wallet, changeable, never unique-by-force. Agree?

**Answered (operator, 2026-10-20; SPEC §2):** 1 yes — no trade window; the exchange is the trade
feature and gifts are wallet transfers (the operator asked for definitions first; they were given).
2 open in part — canned or free text is still the operator's call; what changed is the channels:
**dungeon, local and private message**, designed so group and guild channels can be added later.
That supersedes this note's "shard and hall only, no whispers"; the signing, rate-limit and no-links
rules apply to every channel. 3 yes — one chosen handle per wallet, for chat and the Roll.

**Added 2026-10-22:** dungeon is the one instance of the dungeon — everyone in the run; local is
those on your screen (in the Gatehouse, the room). Anyone may send anyone a private message; the
barriers (links blocked, a blocked-word list) are drawn up when the system is built. Canned
call-outs and free text both, in the end; v0 ships canned call-outs because they are far easier to
build, and free text follows if the play test shows their absence hurts play.

## Could not verify (from `docs/reentry-chat-trade-web-notes.md`)

Any official RotMG chat gate by rank or level; the trade-window countdown; several Tarkov and
Diablo IV details come from secondary pages because the official pages blocked fetches. The
7.5 % and $3-a-day figures are the red team's estimates on the v1 model, not measurements.
