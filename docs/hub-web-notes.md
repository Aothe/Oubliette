# The first city or hub — research notes (raw)

*2026-10-05. One of three parallel research passes (hub / dungeons / re-entry). Every web fact
carries the URL it was read from (SOURCED); reasoning is labelled "inference"; what could not be
verified is listed at the end. Pages that blocked the fetcher (Fandom 403, poewiki's Anubis
challenge) were read from the Wayback Machine and are marked so. Committed 2026-10-22 as the
sources behind `docs/hub.md`; nothing in it is in SPEC §5 and nothing here goes on a public
surface.*

## Verdict (plain English)

1. **Every reference game has a safe room between runs, and what the room holds decides which
   loop it serves.** RotMG's Nexus is the escape key plus the vault plus the realm portals; the
   Grand Exchange is the market made into a place; Tarkov's hideout is a private, offline
   progression base. None of them is decoration first — each exists because something the
   player owns has to live somewhere the game cannot take it.
2. **Oubliette's hub has three mechanics the economy needs and everything else is furniture.**
   The vault (unequipped gear is safe — and on this design the "vault" is simply the wallet,
   since equip is a lock flag, not an escrow move), the wager (equip + entry into a run, one
   relayed transaction after one signature per session), and the exchange (on-chain offers,
   price history for free). Stalls, statues, fountains, chat and guild doors are social
   decoration that can wait.
3. **v0 needs an antechamber, not a city, and the slice already has half of it.** `rooms[0]` of
   the slice is "the hall" where the skill is chosen and locked on leaving. Put one non-combat
   room in front of it with three interactables — a strongbox (vault), a post where the kit is
   fettered (wager/entry), a ledger (offers) — and a door that shows the shard's head-count and
   seals when it is full (the red team's C2 fix). Each interactable is an HTML panel over a chain
   call, in the style the slice already uses for its wager slip and death panel. No new netcode
   beyond "who is standing where".
4. **The hub must not run on the deterministic fixed-tick server.** Determinism exists so that
   deaths and drops can be replayed (SPEC §3.4); the hub has neither. Its authoritative state
   is all on chain already (ownership and locks, offers, runs, deaths). The server it needs is a
   presence room (positions and chat, lossy, ephemeral), an indexer over the chain, the
   shard-former that opens runs, and the relayer. Positions can be client-authoritative; there
   is nothing to cheat.
5. **Instance the hub at about 50–100, with overflow instances, and keep the exchange and the
   record of the dead global.** Reference caps: Destiny 16 then 26, Warframe relays 50 with
   "busy" overflow instances, RotMG realms 85 and one Nexus per 300-player server, EVE's Jita
   2,300 as the single exception to its no-cap rule. SPEC §3.3 already makes the exchange and
   the ledger global and only the simulation sharded; the hub follows the exchange, not the
   shard.
6. **RotMG ran nine months with no hub at all.** Public server January 2010, "lobby/nexus/
   forgotten temple" in Build 106, October 2010. The first release is one dungeon to gauge
   interest (SPEC §7); a city before the economy is proven is scope.
7. **Where hubs broke, it was chat and crowding, never the vault.** RMT advertising bots lagged
   RotMG's Nexus; WoW gold sellers spelled URLs with corpses in Ironforge; OSRS's GE is its
   "public square" and congested enough that avatars fail to load; Warframe relays overflowed to
   100 and were capped back to 50. The GE's lesson is the useful one: once offers are matched
   by the system, nobody has to shout, and the shouting moved off the trade floor.
8. **If the game does not build the market, the community builds it off-site and keeps the
   data.** RotMG never had an in-game exchange; its market is RealmEye's "Trading Offers" page
   (and no in-game marketplace page exists on the wiki as of March 2026). PoE's is a website
   plus a hideout visit. Diablo 2's was d2jsp. SPEC §3.7 is right to make the exchange a
   product; the hub is its front door, not a replacement for it.
9. **The dead should be remembered in the hub, and it costs nothing.** Settlement already posts
   every death on chain; RotMG broadcasts its graveyard publicly and fame survives death;
   RotMG's Wall of Fame is in the Nexus. A roll of the forgotten — who died, wearing what, what
   came back as loot — is the merchants' news feed (deaths are the supply shocks SPEC §3.1
   wants them to read), the delvers' persistence across death (SPEC §3.1: "something must
   persist"), and the brand's irony: the one place in the Oubliette where nobody is forgotten.
10. **Name and order.** v0: *the Gatehouse*, one room. First city, after v0 shows people burn
    tokens for gear they can lose: *the Undercroft* (SPEC Appendix A already notes the name is
    "better for the city than the game") — the Strongrooms, the Reliquary (the exchange as a
    hall), the Gatehouse (portals per shard, the world boss's bar above them, later), the Roll
    of the Forgotten, the Common (chat, fountain, the cosmetics stall that is the only revenue
    line SPEC names). Guild halls, player stalls, seasonal re-dress: later.

---

## 1. What hubs do in the reference games

### 1a. Realm of the Mad God — the Nexus

SOURCED https://www.realmeye.com/wiki/nexus (page says "Last updated: Exalt Version 6.8.0.0
(Mar 2026)"):

- "The Nexus is the hub area in Realm of the Mad God and a safe zone from enemies. In the Nexus,
  you can interact and trade with other players, customize your options, purchase Realm Gold and
  items, and access the Shop. It also allows access to your Vault, Guild Hall and Pet Yard, as
  well as The Tinkerer, the Login Seer and the Wall of Fame. Finally, the Nexus is the gateway
  to the Realm."
- **The escape destination.** "players can return to the Nexus at any time from anywhere by
  pressing the 'Nexus' icon on the right sidebar, or most commonly from pressing a hotkey
  (default R, but customizable from the Options menu). Players can return to the Nexus with no
  delay (not counting the loading screen) … Therefore, 'Nexusing' is a common way to prevent
  death if players suddenly find themselves in a bad situation." *(Note: the slice's recall is
  also R — but three seconds, broken by a hit, shut at the boss. The design deliberately removes
  the instant escape; `docs/capital.md` §6 says RotMG's death-rate sample is biased by "the
  instant escape this design removes".)*
- **Layout.** Spawn platform with: Name Change Statue; Guild Hall Portal ("You may only go
  through this door if you are in a guild"); Vault Portal ("Items in the vault are not lost with
  the death of a character"); Pet Yard Portal ("where pets can be hatched, fed, and upgraded");
  Character Change Statues; six healing fountains ("+100 HP every 1-2 seconds, though they only
  heal one person at a time").
- **Shops.** "The Nexus has eight shops, in which Realm Gold (and rarely, Fame) can be used to
  purchase items." Mystery Box Shop. Two Grand Bazaar portals. Daily Quest Room (Tinkerer,
  Login Seer).
- **Realm portals.** "Below each portal is some fraction, with a denominator of 85 and the
  numerator displaying the current number of players in that realm. All realms are instances of
  the identical game". "There can be up to 8 available at once".
- **Guild Book.** "After getting at least 1000 fame, you can come to the northwest wing of Nexus
  to create a guild".
- **Seasonal re-dress.** "The Nexus changes themes seasonally … There are currently 6 themes"
  and "an 8-hour day-sunset-night-sunrise time cycle, with four maps."
- **Trivia (a hub as a target).** "In February 2014 following the hacking of Realm by SwatSec,
  the Nexus was devastated with many player graves. This look was echoed in the Battle for the
  Nexus dungeon which was released afterwards."

SOURCED https://www.realmeye.com/wiki/vault ("Exalt Version 5.12.0.0 (June 2025)"):
- "The Vault allows you to store items and equipment that you don't currently need, to save them
  from loss when the character carrying them dies." Centrally it also holds "a Daily Quest
  portal, a Pet Yard portal, a Guild Hall portal, a Nexus portal, your Forge and Blacksmith, your
  Enchanter for enchanting, and the Wardrobe where you choose your Character Skin."
- **Slots are the revenue line.** "The Vault chest can initially store 8 items in it. More slots
  can be purchased for 500 Realm Gold per 8 slots". Gift Chest ("does not have a practical limit").
  Potion Rack "initially stores up to 16 potions, but up to four upgrades can be purchased for
  500 Realm Gold apiece" to 256. *(`docs/capital.md` §3 line (d) already lists "cosmetics, vault
  and character slots" as RotMG's own line; see §2 below for why vault slots do not map here.)*

SOURCED https://www.realmeye.com/wiki/trading:
- "Trades can only be initiated within 10 tiles of each player and both players need to stay in
  the same realm while trading." "If either player changes the selected items, both players must
  approve the trade again." "Items that are soulbound cannot be traded".
- "Use RealmEye's own Trading Offers page to find and create offers!" — the market lives on the
  fan site. SOURCED https://www.realmeye.com/wiki/getting-started (via search snippet): "In
  RotMG, there is no standard currency–all trading consists of equipment, potions, and other
  items". `https://www.realmeye.com/wiki/marketplace` returns 404 (checked 2026-10-05): no
  in-game marketplace page exists.
- Spam and bots: SOURCED Wayback copy of https://realmofthemadgod.fandom.com/wiki/Nexus (live
  page returns 403 to this fetcher; search snippet of the same page): "There are a vast amount
  of advertising bots within the Nexus, and these bots play a significant part in the lag caused
  to the server. These bots normally advertise websites where you can buy equipment for the game
  for real money." Trading etiquette (search snippet, realmeye getting-started): "try not to
  spam the Nexus with messages".

SOURCED https://www.realmeye.com/wiki/servers:
- "Realm of the Mad God has 18 servers located across the world, hosted through Amazon Web
  Services. Connecting to a server takes you to its Nexus". "Each server has a maximum capacity
  of 300 players. Attempting to enter a full server will place the player in a queue. Once the
  player reaches the front of the queue, they will automatically enter the server's Nexus."
- **History — the hub came late.** "Initial build (Jan 2010): Realm of the Mad God's public
  server is launched. It consists of a single realm." "Build 66 (Jan 2010): Realm's player limit
  bumped up to 30." "Build 106 (Oct 2010): The 'lobby/nexus/forgotten temple' is introduced."
  "Build 117.? : Nexus split onto two servers: USWest and USEast."

SOURCED https://www.realmeye.com/wiki/guild-hall: "Guild Chronicle", "Guild Board", and
upgrades bought with guild fame — "The first upgrade costs 10,000 guild fame, the second costs
100,000 guild fame, and the final upgrade costs 250,000 guild fame." Upgrades "add additional
cosmetic features, such as rugs, weapon racks, tables".

SOURCED https://www.realmeye.com/wiki/grand-bazaar: "Two Grand Bazaars are located in the Nexus
in each server"; a Class Market of "20 allocated plots"; "The highest tiered item in each
section is only sold for gold … The lowest 2 tiers that are spawned will only be sold for fame."
Also "an area for players to host private dungeons."

SOURCED https://www.realmeye.com/wiki/wall-of-fame: "displays the names of players who
participated in the Unity Support Campaign in 2018 … There are 10,725 player names in the Wall
of Fame." "Since at least October of 2025, the Wall of Fame is broken once again, and fails to
load any names when accessed."

The record of the dead is public by design: SOURCED https://www.realmeye.com/forum/t/how-does-realmeye-know/21718
(search snippet): "The original devs chose to make dead character info (graveyard info) also
public, so that's why RealmEye can display it." RealmEye's own navigation (seen on every wiki
page fetched) lists "Top Dead Characters", "Recent Deaths", players "by Graveyard".
SPEC §3.1 already states the retention reading: "RotMG's answer was fame, the vault and the pet".

**What the Nexus does (inference from the above):** retention — the vault and fame make a death
survivable; economy — the shops are the only sink for Realm Gold and the Nexus is where
face-to-face trading physically happens (10 tiles, same realm); social — portals with head
counts let players pick a crowd, guild doors and the Wall of Fame are belonging. Problems —
advertising bots, lag, the hack, no in-game market so the data and the fee went to a fan site.

### 1b. Old School RuneScape — the Grand Exchange and Varrock

SOURCED https://oldschool.runescape.wiki/w/Grand_Exchange:
- "north-west of Varrock"; OSRS release "26 February 2015" after a poll "76.3%" in favour.
  The original RuneScape GE: SOURCED https://runescape.wiki/w/Grand_Exchange — "Release 26
  November 2007"; "On 1 February 2011 all price (but not necessarily trade) restrictions were
  removed."
- **The offer interface** (the exact shape SPEC §3.7 copies): "Trades succeed when one player's
  buy offer is greater than or equal to another player's sell offer." Price-then-time priority.
  "Members receive eight Grand Exchange slots", "free players are limited to three".
  Collection: "Coins and items from completed trades are collected at any bank".
- **Buy limits.** "The buying rate is restricted to a certain quantity every 4 hours." No sell
  limit. SOURCED https://oldschool.runescape.wiki/w/Flipping: "This limit was implemented by
  Jagex to prevent price manipulation."
- **The tax is a sink.** "Implemented 9 December 2021, increased to 2% on 29 May 2025, capped at
  5 million coins per transaction. 'Most is removed from the game, while a small amount is used
  to purchase select items from other players and delete them.'" Low-level food, teleport
  tablets and tools are exempt.
- **The GE as a place.** The wiki calls it the game's "public square" and primary social hub,
  "often experiencing heavy congestion that affects player avatar loading".
- **Flipping is the merchant game.** Flipping "exploits the spread between pending buy orders and
  pending sell orders as the source of profit." The margin test: "buy one item at considerably
  above the market price. The amount it buys for is the high price … Now, sell that one item at
  well below the market price. The amount it sells for is the low price." "the guide price is the
  average price of yesterday's trades."
- **Price history pages.** SOURCED https://oldschool.runescape.wiki/w/Grand_Exchange_Market_Watch:
  indices since "June 13, 2020 (baseline value of 100)" — Common Trade, Rune, Log, Food, Metal,
  Herb, High Volume indices and boss-loot indices; data from "the official website
  (http://services.runescape.com/m=itemdb_oldschool/)" and "The Old School Wiki's real-time price
  guide (https://prices.runescape.wiki/osrs/)". *(Inference: the item page with a price graph is
  the unit of the merchant loop; SPEC §3.1's "price history, volume, item information, and events
  that move prices" is this page, and an on-chain book gives the data for free —
  `docs/chain.md` §4.)*
- **Before the GE, trading was shouted.** SOURCED https://oldschool.runescape.wiki/w/Trading:
  two-step trade screen; "The official trading worlds are World 301 (for free players) and World
  302 (for members)"; "there is no way to undo a trade; any transaction is final"; the GE
  "automates the process of exchanging items for coins" and reduces "exposure to various scams".
- **Problems.** SOURCED https://gamerempire.net/old-school-runescape-where-can-you-sell-items/
  (search snippet): "The Grand Exchange has plenty of bots and scammers that will spam messages
  and try to persuade you to trade them." Ban volumes (secondary, not verified at source):
  Jagex "banning over 67,000 Old School RuneScape accounts every week" (mein-mmo / fandomwire
  snippets). Jagex's 2007 post SOURCED
  https://oldschool.runescape.wiki/w/Update:Bots_and_Real-World_Trading_Update (11 May 2007):
  "banned 19075 accounts for breaking Rule 7" and "2300 accounts for breaking Rule 12".

### 1c. Escape from Tarkov — the hideout (personal, upgradable, offline)

SOURCED Wayback copy of https://escapefromtarkov.fandom.com/wiki/Hideout (live page 403):
- "The Hideout in Escape from Tarkov is the players' home." "initially found as an abandoned
  and cluttered bomb shelter without any means of sustaining life. The player can build and
  improve various modules to get access to extra features like crafting stations, additonal
  storage, a shooting range, a gym and character boosts."
- Modules listed: Air Filtering Unit, Bitcoin Farm, Booze Generator, Cultist Circle, Defective
  Wall, Gear Rack, Generator, Hall of Fame, Heating, Gym, Illumination, Intelligence Center,
  Lavatory, Library, Medstation, Nutrition Unit, Rest Space, Scav Case, Security, Shooting Range,
  Solar Power, Stash, Vents, Water Collector, Weapon Rack, Workbench.
- "Every item crafted in the Hideout will have the found in raid status." Bitcoin Farm level 1:
  "Additional Graphics card slots +10", "34 hours" to build. Upgrades require raid loot (e.g.
  "10 Power supply unit found in raid").
- Retention reading, SOURCED https://www.shacknews.com/article/141320/tarkov-hideout: "nothing
  more but a rundown bunker but with a little love and care it turns into a fully functional
  forward operating base"; "building out your hideout takes time"; before the Flea Market it is
  "a herculean task". Flea Market unlock "Level 15" (SOURCED insider-gaming.com snippets, 2025–26;
  categories now gated to 20–40).
- Not a social space: nothing on the page describes other players in it. *(Inference: the
  hideout is retention through sunk investment that a death cannot touch — the closest analogue
  to SPEC §3.1's "account (unlocks, cosmetics, knowledge, reputation)".)*

### 1d. Path of Exile — hideouts and towns

SOURCED Wayback copy of https://www.poewiki.net/wiki/Hideout (live page serves an Anubis
proof-of-work challenge):
- "hideout is a special area players can design for themselves. Hideouts can first be unlocked
  after freeing Helena in Act 2". "Players can invite certain NPCs, including masters … Players
  can also decorate their hideout with decorations. Hideouts are also where the Crafting Bench is
  stored." "Hideouts can be visited using the /hideout command while in town, or from any
  waypoint."
- Visitors: "Players can visit someone else's hideout by right clicking on the desired player's
  name and choosing 'Visit Hideout'." "Visitors can sell at masters, but cannot buy, and cannot
  use any crafting benches." "A Guild hideout is an special area for the guild members."
- Trade flow (search snippets from pcgamer.com and progameguides.com; the pcgamer page itself
  did not render for the fetcher): the trade site "pathofexile.com/trade", click "whisper" to
  copy a message, the seller "invite[s] you to their hideout to trade"; with a premium stash tab
  "a buyer can teleport into your hideout and take the item while you're offline."
- *(Inference: PoE's market is deliberately a website plus a private room; the town is the
  waypoint. It shows that "the merchants' place" need not be a crowd — but PoE's friction is a
  design stance this spec rejects by choosing the GE model.)*

### 1e. Destiny — the Tower

SOURCED https://www.destinypedia.com/Tower (Destiny 1): "16" players per instance; "Public" area
with no combat; Cryptarch, Postmaster, "Vault access", bounty tracker, faction vendors, Xûr at
weekends; players "regroup, rearm, and form new alliances before venturing beyond".
SOURCED https://www.destinypedia.com/Tower_(Destiny_2): "26" per instance; "the main hub for
Guardians in between activities"; mini-games ("Lava Challenge", "soccer in the Hangar");
Eververse (cosmetics vendor) is in the Tower.

### 1f. Warframe — relays and Maroo's Bazaar

SOURCED https://wiki.warframe.com/w/Relay: "Note that each instance of a relay can be occupied
by up to 50 players. When the status of an instance is busy, another instance will appear in
case of players have fully occupied said instance". "Relays are colossal Tenno architectures,
which serve as hub stations where players can interact with each other, as well as do business
with Syndicates". Relays were "destroyed by Balor Fomorians" in an event and some "rebuilt during
The Pyrus Project". Patch history: "Hotfix 27.5.6 (2020-05-26) Fixed Relays overflowing to 100
players by returning its max capacity to 50." Trading: SOURCED
https://wiki.warframe.com/Trade_System (search snippet) — trade "at the Clan Dojo … or at the
dedicated trading relay - Maroo's Bazaar"; "minimum Mastery requirement of Rank 2"; "up to 6
items can be traded per transaction". Advice (search snippet, pcgamer): at Maroo's "Always choose
one that is 'busy' so that you're with as many players as possible."

### 1g. Sea of Thieves — outposts

SOURCED https://seaofthieves.wiki.gg/wiki/Outpost: "Island towns with a variety of characters
and man-made structures that offer various services"; spawn points for new crews; cosmetic shops;
Trading Company representatives offering voyages. The page does not say outposts are safe zones
and does not describe player-to-player trading (a search snippet from a non-wiki site claimed
"safe zones"; not verified — see "Could not verify").

### 1h. Cities where the economy happens socially

- **EVE Online, Jita.** SOURCED https://wiki.eveuniversity.org/Jita: "Jita is the center of
  trade in New Eden and is by far the largest hub in game, often having over 1000 players in
  system". SOURCED https://www.eveonline.com/news/view/observing-the-burn-jita-player-event
  (CCP, 2 May 2012): "the strain from all that commerce has been enough to overload the server
  it runs on, and so we've made a single exception in our 'no population caps' rule"; the cap
  "2,300"; "preventing someone from jumping in to make some deals isn't nearly as bad as
  preventing people from jumping into a huge fleet fight."
- **World of Warcraft, trade chat.** SOURCED https://warcraft.wiki.gg/wiki/Trade_chat: "a
  common Chat channel that only works in capital cities", "linked across all such cities on a
  single realm", "intended for buying, selling, and trading of items and services" but "often
  used for general chatting, gold selling, and guild recruitment"; a separate "Trade (Services)"
  channel was added in patch 9.2.7. Gold sellers "used dead player bodies to spell out website
  names" in Ironforge and Orgrimmar (SOURCED
  https://www.engadget.com/2008-08-08-death-is-in-the-air-for-gold-sellers.html, search snippet).
- **Diablo 2.** Trade happened in Battle.net lobby channels and "trade games", and off-site on
  d2jsp with its "forum gold" bought for real money (search snippets, us.forums.blizzard.com
  threads titled "Shut down d2jsp", "D2R and JSP Problem"; maxroll.gg trade guide). *(Inference:
  the off-site market is the default outcome when the game offers none.)*
- **Albion Online, Caerleon's Black Market** — the closest cousin to "the market profits from
  the fallen". SOURCED
  https://www.gamingonlinux.com/2017/06/albion-onlines-new-black-market-feature-is-sounding-really-interesting/
  and the Hector release note (search snippets; the albiondatabase guide returned 403): the
  Hector update of 7 June 2017 added "a new NPC that takes player crafted equipment and
  distributes it out to the various mobs and chests in the world", based in Caerleon, so "all
  drops will be items created by other players"; buy orders rise with kills. *(Inference:
  Albion recycles sold gear into drops; Oubliette recycles the dead's gear into drops. In both,
  the exchange is upstream of loot, which is the argument for the exchange being a place
  delvers walk through, not a menu.)*
- **Dark and Darker** — the nearest modern extraction crawler with gear loss and a player
  market. SOURCED https://darkanddarker.wiki.spellsandguns.com/Trading: Trading Post "Minimum
  Level: 20", "Initiation Fee: 25 Gold", "Trading Post Cost per trade: 15 Gold"; "You can link an
  item in the trade chat by holding SHIFT"; Marketplace "Items will be listed for 7 days before
  expiring", "Marketplace Cost per trade: 5% of the Selling Price or 15g, whichever value is
  higher"; "Squire Status" buys only, "Legendary Status" sells. *(Inference: friction and fees as
  RMT resistance; this spec gets the same from gas — $0.006 per on-chain offer,
  `docs/chain.md` §4.)*

### 1i. What each hub does — a table

| Game | Retention | Economy | Social | Where it broke |
|---|---|---|---|---|
| RotMG Nexus | vault, fame, pet; the escape key | Realm Gold shops; face-to-face trading within 10 tiles; no in-game market | portals with n/85 counts; guild door; Wall of Fame; seasonal themes | ad bots lag the server; 2014 hack; market on a fan site |
| OSRS GE / Varrock | — | the offer book, 4-h limits, 2 % tax sink, price pages, flipping | "public square"; W301/302 | congestion; bots and scammers at the GE |
| Tarkov hideout | sunk investment untouched by death; crafting; stash | Flea Market at level 15 gates it | none | — |
| PoE hideout / town | personal decoration; crafting bench | website + hideout visit; no auction house | guild hideout; visitors | friction by design |
| Destiny Tower | vault, postmaster, vendors | Eververse cosmetics | 16 → 26 per instance; mini-games | capacity small by design |
| Warframe relays | syndicates, Baro | Maroo's Bazaar; dojo trading, 6 items a trade | 50 per instance, overflow | overflowed to 100 (2020 hotfix) |
| Sea of Thieves outposts | — | sell treasure to companies | spawn, crews | (not verified) |
| EVE Jita | — | the market hub | "over 1000 players in system" | 2,300 cap, the one exception |
| WoW cities | — | auction house (not researched) | trade chat linked across cities | gold spam; corpse-spelled URLs |
| Dark and Darker | — | trading post + marketplace with fees and level gates | trade chat | (not researched) |

---

## 2. What this game's hub must do — derived from the spec

Each item: what the spec says → what the hub needs → v0 / first city / later.

**The vault.** SPEC §3.1: "the vault (unequipped gear is safe — only what is on-chain-equipped
is at risk)". `docs/chain.md` §4: equip/unequip is "lock flag, never an escrow move"; the
Settlement role "may change only items locked into a run it opened"; "nothing can mint the
token, change a mint price, or touch a vaulted item." → **The vault is the wallet.** There is no
vault contract, no slot count, no chest to fill: every Gear token in the wallet with `inRun`
clear is "vaulted". The hub's strongbox is a *read* of the Gear and Items contracts for the
connected wallet, and its only write is the lock. Consequence (inference): RotMG's vault-slot
revenue line (500 Realm Gold per 8 slots) does not transfer — a wallet holds any number of
NFTs; `docs/capital.md` §3 line (d) should not count on it. **v0** (a list panel).

**Equip = the wager, with one signature.** `docs/chain.md` §4, "The life of a run": "(1) The
player signs once per session: an authorisation for a throwaway session key. (2) Entry — one
transaction, relayed so there is no pop-up: locks the kit, the skill item and any consumables
into run R until time T (about 70,000–90,000 gas, under a cent); a second entry for a locked
item fails on chain, so the chain is the tie-breaker (red team D2, D4)." → **Yes: one wallet
signature per session, then every wager is a relayed transaction with no pop-up.** But note the
entry names a run id, so the sequence in the hub is: choose the kit and the skill → join the
queue for a shard → the shard forms and the server calls `openRun(commitment)` → each player's
entry transaction is relayed → the door opens. The hub is therefore where the shard forms, and
the red team's C2 fix ("a door that seals — a ready plate with a short timer; anyone not on it is
recalled with wager and no loot; the boss scales to the number inside; no late entry") is a hub
object. **v0.** *(Open, inference: whether "equip" exists separately from "entry" at all. chain.md
lists both "equip/unequip (lock flag)" and "Entry … locks the kit … into run R". If equip is only
ever entry, the hub has one action, not two, and "equipped but not in a run" never exists — a
simplification worth taking.)*

**Choose the skill.** SPEC §2: "One ability per delver per run, carried as a wagered item". §4:
"chosen in the entry hall and locked once the delver leaves it". The slice (`proto/visual/
index.html` ~L677): `rooms[0]` is the hall; crossing its edge sets `G.locked` and logs "You
leave the hall with …". The skill item must be in the entry transaction (it is locked with the
kit), so it is chosen *before* the door, not after. → The hall in the slice can stay as the
dungeon's first room (it is part of the seeded map), but the lock-in moves to the hub's door.
**v0.**

**The exchange as a place.** SPEC §3.7: offers "matched by the contract, with price history
public"; §3.1: "price history, volume, item information, and events that move prices"; §7 v0:
"a minimal offer-based exchange"; `docs/chain.md` §5: "recommend the on-chain book for v0" —
"price history for free, no private order flow, $0.006 a placement"; fills "credited to a balance
the buyer withdraws, no recipient callbacks" (that is the GE's collection box). → **v0 is a
ledger panel** (place an offer, see the book, collect). The *place* — stalls per item family,
price banners, a clerk — is the first city. What the GE has that SPEC §3.7 does not yet name
(inference, from §1b): a 4-hour buy limit against manipulation; a cap on open offers per player
(gas gives one for free); a guide price (needs the indexer); item pages. Merchants as visible
people: in the GE they are avatars standing on the floor; in Oubliette, inference, a merchant is
a wallet with open offers, and a hub that shows "who is at the stall" is showing offer owners —
useful theatre, no mechanism. **First city.**

**The way into dungeons.** SPEC §3.3: shards of "~50–85"; §7 v0: "one shard (~20 players)".
RotMG's realm portals with "n/85" beneath are the pattern to copy exactly. → **v0: one door with
a head-count and the ready plate.** First city: a portal room, one portal per shard, with
"busy" selection (Warframe's model). *(Inference: the queue must span hub instances, or the
hub's cap becomes the shard's cap.)*

**The world boss's shared bar.** SPEC §3.3: "a world boss whose health bar is pooled across
shards"; §7: not v0. → A bar over the portal room, fed by the indexer. **Later.**

**What persists across death.** SPEC §3.1: "the account (unlocks, cosmetics, knowledge,
reputation). Something must persist across death or players quit after the first one; RotMG's
answer was fame, the vault and the pet". §4 open: "fame, unlocks, cosmetics, a pet?".
`docs/chain.md` §4: settlement posts "deaths, the per-item death-split and wear as one root";
"Deliberately not on chain: … chat, fame." → **The record of the dead is free**: every death,
what was worn, what burned and what returned is already public on chain. A Roll of the Forgotten
in the hub (name or wallet, kit, what came back, which run) serves three things at once: the
delver's persistence (RotMG's graveyard is public by the original developers' choice, §1a), the
merchant's news feed (SPEC §3.1: "merchants' inventory appreciates on every death" — the roll is
where they see it), and the name. *Inference on taste:* "oubliette" is the place of forgetting;
the hub being the one place the dead are named is the right irony, and it is the cheapest
feature in this note. **v0 as a list; first city as a wall.**

**Chat.** `docs/chain.md` §4 keeps chat off chain. Every hub in §1 that had open chat grew RMT
spam (RotMG bots, WoW gold sellers, GE scammers). The GE's lesson: once offers are matched by
the system there is nothing to shout. → **v0: no hub chat** (the shard has its own, if any).
First city: hub chat rate-limited, no links, trade talk pointed at the ledger. **First city.**

**Guilds.** Not in SPEC §7 either way; `docs/red-team.md` C1 shows an organised group filling a
shard is the main co-op exploit, so guild tooling is a risk before it is a feature. → **Later**,
after random assignment with a party cap (C1's fix) exists.

**Fun at $0 and the hub.** SPEC §2: "The core loop must retain players with worthless items."
Inference: the hub is where a wallet-less visitor can stand — watch the ledger, read the roll,
see a shard form — so the hub must open without a wallet and gate only the three chain actions.

---

## 3. Shape and tech

**Shape.** Top-down, 16 px tiles, the slice's renderer (a 320×200 buffer drawn at 2×, tile maps
pre-rendered once — `proto/visual/index.html` `prerender`). The hub is a *hand-placed* map, not a
seeded one: nothing in it needs to be reproducible. The slice's `rooms[0]` hall is 9×7 tiles;
RotMG's Nexus is several screens with a spawn platform, four wings and a portal room (§1a). A
v0 antechamber of about 20×12 tiles; a first city of roughly 60×40 (inference, sized from the
Nexus layout and the Grand Bazaar's 20 plots).

**Global or per-shard.** SPEC §3.3 shards the *simulation* and makes "one global exchange; one
ledger". The hub is not a simulation, so it follows the exchange: one hub, instanced for load,
with the ledger, the roll and the shard queue identical in every instance. Reference caps for a
walkable social space: Destiny 16 then 26 (§1e); Warframe 50 with overflow instances and a bug
when it hit 100 (§1f); RotMG one Nexus per 300-player server, realms at 85 (§1a); Jita 2,300 as
EVE's only cap (§1h). Inference: for a browser client drawing 16 px sprites, the ceiling is
bandwidth and draw calls, not simulation — 100 players at 10 position updates a second is about
8 KB/s to each client and 100 KB/s out of the server; the playable limit is visual (a hundred
sprites on a 320×200 buffer is a crowd). **Recommend instances of 50–100 with Warframe-style
"busy" selection; the shard queue spans instances.**

**Does the hub need the deterministic server?** No. SPEC §3.4's determinism exists so that "anyone
replays the input log … and gets the same deaths and the same drops". The hub has no deaths, no
drops, no loot, no combat; nothing in it is settled from a replay. The cheapest honest
architecture (inference):

| Concern | Where it lives | Why |
|---|---|---|
| ownership, locks, vault contents | chain (Gear, Items) | already the rule; the hub reads it through an indexer |
| offers, fills, price history | chain (Exchange) | `docs/chain.md` §5 recommends the on-chain book; history is free |
| run entry, the shard roster | chain (Runs) via the relayer | entry is the wager; the chain is the tie-breaker (D2, D4) |
| deaths, the roll | chain (settlement) | posted per run already |
| positions, emotes, chat | a presence room (WebSocket), lossy, ephemeral, client-authoritative | no consequence to cheating a position where nothing can be won |
| shard forming, `openRun`, relaying entries | the game server's lobby role | it must know who is ready; it already holds the session keys |
| fame, profile, cosmetic unlocks | off-chain account store (fame) / chain (cosmetics as NFTs, §3.5) | chain.md keeps fame off chain |

Nothing in the hub needs to be persisted by the hub: close the tab and the only thing lost is
where you were standing. The presence room can be the same process as the shard server's lobby
or a separate one; it has no tick and no log.

**Trust statement (inference).** The hub shows chain state through the operator's indexer. A
player who distrusts it can read the contracts directly; the hub should expose the contract
addresses and the run ids it shows, in the same spirit as the "server is the operator's" line
SPEC §6 wants on the site.

---

## 4. Art and build cost

**What the bank already has** (`art/world.js`, `art/creatures.js`, `art/items.js`, counted
2026-10-05: 99 `A.add` calls):

- **Five tilesets** with a generator for floor (plain / cracked / grown-over), wall face, wall
  top and liquid: gaol, cistern, ossuary, foundry, overgrowth. The gaol's tiles make the hub
  continuous with the one dungeon; the ossuary's "skulls: true" wall face is the obvious wall for
  the record of the dead.
- **Twenty props:** torch, brazier, bag, grave, bone, skull, barrel, crate, chest, chest_open,
  door, portcullis, pillar, cage, banner (3 colourways), altar, bookshelf, sarcophagus, spikes,
  cobweb. Of these, chest / chest_open serve as the strongbox, door and portcullis as the shard
  door, banner as stall and price flags, bookshelf as the ledger's shelves, altar as the
  fettering post, pillar and torch as dressing, grave for the roll.
- **Sixteen delver looks** (four class bodies × four cloaks) — enough for hub avatars to differ.
- **Humanoid enemies that recolour into NPCs** in one line (the bank's own rule: "A recolour is a
  letter swap"): gaoler, warder, acolyte, watcher — a warder at the door, a gaoler as the
  strongbox keeper, an acolyte as the clerk.
- **Every item icon the UI needs:** 17 gear families × 3 tiers, 6 relics, 3 skill items, 9
  consumables including `repair_kit` and `certificate` (the stock-drop stand-in).
- **UI marks:** three skill icons, six status marks.

**What a first hub would need drawn** (inference; the method is letter grids, so each prop is an
hour or two, a recolour a line):

| Need | For | New or reuse |
|---|---|---|
| strongbox / counter | vault | reuse `chest`, `chest_open` |
| fettering post with chains | wager | new (1 prop), or `altar` + `cage` chain |
| ledger desk and a price board | exchange | new (2 props); `bookshelf` behind |
| stall awning × 2–3 | the Reliquary's stalls | new (2–3 props); `banner` as flags |
| the ready plate and the sealed door | shard door | new floor plate (1); reuse `portcullis` |
| the drop / stair down | portal | new (1 prop; the slice's seal ring can be reused as a floor mark) |
| wall of names | the roll | new (1 wall prop); ossuary face behind |
| sign posts, a fountain | dressing | new (2) |
| NPCs: warder, keeper, clerk | interactables | recolours of `warder`, `gaoler`, `acolyte` (3 lines) |
| hub tile theme | one more theme | a colour set, 1 line, if the gaol's is not used as-is |

About 10–12 new props and 3 recolours. **The screens are the real cost**, and they are HTML
panels in the slice's existing style (it already has a wager slip aside, a skills row, and a
death / extract / recall overlay with per-item fate rows):

1. **Vault panel** — owned items from the indexer, lock state, "wager this" toggles. v0.
2. **Wager / door panel** — the slip the slice already draws ("At wager — lost if you die"), plus
   the skill choice (already there), plus the shard head-count and a ready button. v0.
3. **Ledger panel** — place buy / sell offer at a price, my open offers, collect fills; one item
   page with a price line. v0 minimal; first city adds history charts per item and volume.
4. **The roll** — recent deaths from settlement: who, kit, what returned. v0 as a list.
5. **Queue / portal room** — per-shard counts, instance selection. First city.
6. **World boss bar** — later.

Rough size (inference, measured against the slice which is one self-contained file of ~1,070
lines with no build): the Gatehouse is a few days of slice-style work once the contracts and the
indexer exist — the pixels are an afternoon, the three panels and the relayer wiring are the
days. The Undercroft is weeks, dominated by the exchange UI (history, item pages) and the
presence room, not by art.

---

## 5. Recommendation — the first hub, named, with a build order

**Register.** The game is the Oubliette, the first dungeon the Gaol, the boss the Turnkey. A gaol
is entered through its gatehouse; beneath it is an undercroft (SPEC Appendix A on "Undercroft":
"The vault beneath. Where the exchange and the market-city would live … Better for the city than
the game"); the exchange is a reliquary (Appendix A on "Reliquary": "Where relics of the dead are
kept. Dead players' gear becomes relics others claim; the exchange is the reliquary"). All three
names are already the spec's own.

### v0 — the Gatehouse (one room, the antechamber the spec does not forbid)

SPEC §7 puts "the market city" outside v0 and says nothing against a room; v0 *requires*
"permadeath with vault · on-chain mint / equip / unequip / drop · a minimal offer-based exchange",
and each of those needs a screen the delver reaches between runs. Today the slice reaches them
through the death and extract panels that restart the run (`showDeath`, `extract`,
`recallOut`). The Gatehouse is where those panels go instead of a restart button.

| Object | Does | Spec rule it serves | Mechanic or decoration |
|---|---|---|---|
| **the Strongbox** (`chest`, a gaoler as keeper) | lists the wallet's unlocked gear and consumables; nothing here can be lost | §3.1 vault; chain.md "touch a vaulted item" never | mechanic |
| **the Fettering post** (`altar` + chains) | choose the kit and the skill to wager; one relayed entry when the door opens | §2 equip is the wager; §2 skills; chain.md entry; red team D2/D4 | mechanic |
| **the Ledger** (desk, an acolyte as clerk) | place and collect offers; see the book | §3.7; §7 "minimal offer-based exchange"; chain.md §5 on-chain book | mechanic |
| **the Door** (`portcullis`, a warder) | head-count n/20; ready plate with a timer; seals when the shard forms; no late entry | §3.3 shards; §7 one shard; red team C2 | mechanic |
| **the Roll** (a wall of names) | recent deaths: who, kit, what returned to the pool | §3.1 "something must persist"; §3.1 merchants read deaths | mechanic (the merchants' feed) and the brand |
| the mint | burn token + ETH for tier-1 gear | §3.2, §3.5 sources | mechanic — needed on day one, since supply starts at zero (`docs/capital.md` verdict 1) |
| torches, a bench, the gaol's tiles | — | — | decoration |

No chat, no other players drawn (optional: show the shard-mates waiting at the door as sprites;
cheap, and it makes the head-count real). The slice's in-dungeon hall stays as the dungeon's
first room.

### First city — the Undercroft (after v0 answers §7's question)

| Area | Does | Serves | Mechanic or decoration |
|---|---|---|---|
| **the Strongrooms** | the vault as a room; repair here (burn token) | §3.1; §3.5 durability → repair | mechanic (repair), decoration (the room) |
| **the Reliquary** | the exchange as a hall: one stall per item family, each a view of the one book; price banners; item pages with history and volume; the clerk | §3.1 "price history, volume, item information, and events"; §3.7 | mechanic (the book, the pages); decoration (stalls, merchants as visible people) |
| **the Gatehouse** | a portal per shard with counts; "busy" instance choice; the ready plate | §3.3; red team C2 | mechanic |
| **the Roll of the Forgotten** | the full wall: deaths, kits, what returned, which run; per-wallet pages | §3.1 persistence; the merchants' news; the name | mechanic and brand |
| **the Common** | chat (rate-limited, no links), a fountain, a cosmetics stall — the one revenue line SPEC names (§3.5, `docs/capital.md` verdict 4), seasonal re-dress | §2 fun at $0 (a wallet-less visitor can stand here) | decoration, except the cosmetics stall |

### Later

Guild halls (only after C1's random assignment and party cap exist); the world boss's pooled bar
over the Gatehouse (§3.3, not v0); player-hosted private runs (RotMG's Grand Bazaar hosts
dungeons); a "visit a hideout" private room if cosmetics ever include furniture (PoE, Tarkov);
Albion-style local markets — **no**: SPEC §3.3 is one global exchange, and that stays.

### What is social decoration and what the economy needs — in one line each

Needed: vault read, entry relay, the offer book, the shard door, the roll, the mint, repair.
Decoration: stalls as views, NPC bodies, fountains, chat, statues, themes, guild rooms, cosmetics
furniture — with the cosmetics *stall* the exception, because it is revenue.

---

## Could not verify

- **Fandom wikis (RotMG, Tarkov) return 403** to this fetcher; both were read from Wayback
  Machine copies (`web.archive.org/web/2024/…Nexus`, `…/2025/…Hideout`) and the RotMG bot/lag
  sentence is also only a search snippet of the live page. **poewiki.net** serves an Anubis
  proof-of-work page; read from Wayback.
- **The OSRS GE being one exchange across all worlds** — common knowledge, not on the page read.
- **RotMG's Nexus capacity per instance.** Only "each server has a maximum capacity of 300
  players" and "Connecting to a server takes you to its Nexus" are sourced; that the Nexus holds
  up to 300 is inference. Whether a server runs more than one Nexus instance: not found.
- **RotMG in-game marketplace:** the RealmEye page is a 404 and no other page describes one;
  treated as "none exists as of the March 2026 wiki", not proven.
- **Sea of Thieves outposts as safe zones** — the wiki.gg page says nothing; the claim came from a
  non-authoritative search snippet. My recollection is that outposts are not safe zones; untested.
- **PoE's "no auction house by design"** — GGG's trade manifesto was not fetched; the trade flow
  is from search snippets of pcgamer / progameguides.
- **Albion's Hector update date (7 June 2017) and the Black Market description** — search
  snippets of gamingonlinux and the Hector release notes; the gamingtrend article is a 404 and
  albiondatabase / the Albion wiki return 403.
- **Jagex "67,000 bans a week"** — mein-mmo / fandomwire snippets, not Jagex's own page.
- **Tarkov Flea Market at level 15** — insider-gaming snippets, not BSG's page.
- **All bandwidth, head-count and build-time figures in §3 and §4 are inference**, sized against
  the reference caps and the slice's file; nothing here was measured.
- **Whether "equip" and "entry" are one action or two** (§2) is an open design reading of
  `docs/chain.md` §4, not a decision.
