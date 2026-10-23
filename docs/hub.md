# The first city, or hub

*Synthesis of `docs/hub-web-notes.md` (sourced) against SPEC §2, §3.1, §3.7, §7 and
`docs/red-team.md`. Written 2026-10-05 as a proposal; the operator's decisions on it (2026-10-20)
are at the end and in SPEC §2.*

## The short version

1. **A hub exists because something the player owns has to live where the game cannot take
   it.** RotMG's Nexus is the escape key plus the vault plus the realm portals; OSRS's Grand
   Exchange is the market made into a place; Tarkov's hideout is offline progression that death
   cannot touch. None of them is decoration first.
2. **Oubliette's hub needs exactly three mechanics; the rest is furniture.** The vault, the
   wager (equip plus entry into a run), and the exchange. Everything else — stalls, fountains,
   statues, chat, guild doors — can wait.
3. **v0 needs one room, not a city, and the slice already has half of it.** Today the death and
   extract panels restart the run. Put one non-combat room in front of the dungeon — **the
   Gatehouse** — and those panels become its objects: a strongbox (vault), a post where the kit
   is fettered (wager), a ledger (offers), a door with the shard's head-count that seals when
   the shard forms, a roll of recent deaths, and the mint. Each is a panel over a chain call in
   the style the slice already uses. SPEC §7 forbids the *market city* in v0; it does not forbid
   a room, and the vault, equip and exchange it requires all need a screen between runs anyway.
4. **The hub must not run on the deterministic server.** Determinism exists so that deaths and
   drops can be replayed; the hub has neither. Positions can be client-authoritative; the
   authoritative state (ownership, locks, offers, runs, deaths) is on chain already. What it
   needs is a presence room (who is standing where, lossy), an indexer over the chain, the
   shard-former, and the relayer. Nothing in the hub needs persisting by the hub.
5. **Instance it at about 50–100 and keep the exchange, the roll and the shard queue global.**
   Reference caps: Destiny 16 then 26, Warframe 50 with "busy" overflow instances, RotMG one
   Nexus per 300-player server with realms at 85. SPEC §3.3 already shards only the simulation;
   the hub follows the exchange, not the shard.
6. **The dead should be remembered here, and it costs nothing.** Settlement already posts every
   death on chain. A *Roll of the Forgotten* — who died, wearing what, what came back as loot —
   is three things at once: the delver's persistence across death (SPEC §3.1: "something must
   persist"), the merchants' news feed (deaths are the supply shocks SPEC §3.1 wants them to
   read), and the name's irony: the one place in the Oubliette where nobody is forgotten.
7. **Where hubs broke, it was chat and crowding, never the vault.** RMT bots lagged RotMG's
   Nexus; WoW gold sellers spelled URLs with corpses; the GE is OSRS's congested public square.
   The GE's lesson is the useful one: once offers are matched by the system, nobody shouts.
8. **RotMG ran nine months with no hub at all** (public in January 2010; the Nexus in
   October 2010). A city before the economy is proven is scope.

## Two things the research found that change the spec's picture

- **The vault is the wallet.** On this design, equip is a lock flag on the item, never an escrow
  move (`docs/chain.md` §4), so "vaulted" simply means "in the wallet and not locked into a
  run". There is no vault contract, no slot count, nothing to fill. Consequence: RotMG's
  vault-slot revenue (paid vault expansions) does not transfer; `docs/capital.md`'s revenue
  lines should not count on it.
- **"Equip" and "entry" may be one action.** `docs/chain.md` lists both, but if the only time a
  kit is at risk is inside a run, then "equipped but not in a run" never needs to exist and the
  hub has one action: choose the kit and the skill, join the queue, and when the shard forms
  the entry transaction is relayed. That also makes the red team's sealing door (C2) a hub
  object, because the hub is where the shard forms.

## What the hub holds, and which bin it goes in

| Object | What it does | Why the spec needs it | Bin |
|---|---|---|---|
| the Strongbox | lists the wallet's unlocked gear and consumables; nothing here can be lost | §3.1 vault | v0 |
| the Fettering post | choose the kit and the skill to wager; one relayed entry when the door opens | §2 equip is the wager; §2 skills; red team D2/D4 | v0 |
| the Ledger | place and collect offers; see the book | §3.7; §7 "minimal offer-based exchange" | v0 |
| the Door | head-count n/20, a ready plate with a timer, seals when the shard forms, no late entry | §3.3; red team C2 | v0 |
| the Roll | recent deaths: who, kit, what returned to the pool | §3.1 persistence; merchants read deaths | v0 as a list |
| the mint | burn token + ETH for tier-1 gear | §3.2, §3.5; supply starts at zero | v0 |
| the Strongrooms | the vault as a room; repair here | §3.5 durability → repair | first city |
| the Reliquary | the exchange as a hall: one stall per item family, each a view of the one book; price banners; item pages with history and volume | §3.1 "price history, volume, item information, events" | first city |
| the portal room | one portal per shard with counts; "busy" instance choice | §3.3 | first city |
| the Roll of the Forgotten | the full wall, per-wallet pages | §3.1; the brand | first city |
| the Common | chat (rate-limited, no links), a fountain, the cosmetics stall — the one revenue line SPEC names | §2 fun at $0; §3.5 cosmetics | first city |
| guild halls, the world boss's bar, player-hosted runs, hideouts | — | §3.3 world boss not v0; red team C1 before guilds | later |

Needed by the economy: vault read, entry relay, the offer book, the shard door, the roll, the
mint, repair. Decoration: stalls as views, NPC bodies, fountains, chat, statues, themes, guild
rooms — except the cosmetics *stall*, which is revenue.

## Names

Already the spec's own (Appendix A): the game is the Oubliette, the first dungeon the Gaol, its
boss the Turnkey. A gaol is entered through its **Gatehouse**. Beneath it is the **Undercroft**
("the vault beneath; where the exchange and the market-city would live"). The exchange hall is
the **Reliquary** ("dead players' gear becomes relics others claim"). The wall is the **Roll of
the Forgotten**.

## Shape, tech, cost

- Top-down, 16 px tiles, the slice's renderer; a hand-placed map, not a seeded one. A v0
  Gatehouse of about 20×12 tiles; a first city of roughly 60×40.
- One hub, instanced for load; the ledger, the roll and the queue identical in every instance.
  The queue must span instances or the hub's cap becomes the shard's cap.
- The art bank already has what the room needs: five tilesets (the Gaol for the Gatehouse), a
  chest, door, portcullis, altar, banner, bookshelf, sarcophagus, cage; humanoid enemies
  recolour into NPCs in one line; every item icon exists. A first city needs roughly ten to
  twelve new props. The real cost is the screens — vault, wager and door, ledger, roll — not
  the pixels.
- A wallet-less visitor can stand in the hub, read the ledger and the roll and watch a shard
  form; only the three chain actions are gated. That is "fun at $0" applied to the lobby.

## Decisions this asks of the operator

1. Is a one-room Gatehouse inside v0? (Recommended: yes. It is where v0's required screens go,
   and it replaces the restart buttons with a place.)
2. Does the dead's record go public by name, as RotMG's graveyard does? (Recommended: yes, by
   chosen handle; it is the cheapest retention and the merchants' feed.)
3. Should "equip" exist apart from "entry"? (Recommended: no — one action, the kit is at risk
   only inside a run; `docs/chain.md` §4 to be read that way.)

**Answered (operator, 2026-10-20; SPEC §2):** 1 yes — a one-room Gatehouse inside v0. 2 yes — the
dead named publicly on the Roll, by chosen handle. 3 no separate equip — one action; the kit is at
risk only inside a run. And the Undercroft is the first city, after the one-dungeon release gauges
interest.

**Added 2026-10-22:** the Roll also shows how they died and a link to the run's replay. The wallet
is the login — a character on screen, chat and the chain actions need one; watching the Gatehouse or
a run does not.

**Added 2026-10-22, after the operator played the Gatehouse in the slice:** the interactables are
liked; the hub should be a village outside the dungeon, with NPCs behind desks for the bank, the
exchange and the rest, from which you go to where the dungeons are — not a room in front of the
dungeon. The six objects keep their jobs as the village's desks and its gate; the village's size and
its other desks are open (SPEC §4).

## Could not verify (from `docs/hub-web-notes.md`)

Fandom and poewiki pages were read via the Wayback Machine; the RotMG Nexus per-instance cap
(300) is inferred from the server cap; Sea of Thieves outposts as safe zones; the PoE trade
manifesto; all head-count, bandwidth and build-time figures are inference.
