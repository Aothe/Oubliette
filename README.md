# Oubliette

*What you die wearing is no longer yours.*

A permadeath dungeon crawler — top-down pixel art, cooperative, real-time, in the Realm of the
Mad God line — where gear is on chain. Mint it by burning the game token; equip it on chain as
the wager; take it into the dungeon; die, and it is gone — part of it returning as loot for
whoever finishes, the rest destroyed. Bosses are piñatas that drop gear, consumables and
tokenised stock — never the game's own token. A Grand-Exchange-style market, priced in that
token, makes this two games in one: the people who delve, and the people who trade.

Play-to-risk, not play-to-earn. Every play-to-earn game died of inflation — all source, no sink.
Permadeath is a sink players choose, and the drama is the point.

## Where this is

Nothing is built. `SPEC.md` is the design: decisions taken, the mechanism, what is open, what is
verified and what is assumed, the v0 line. `sim/economy.py` is the first piece of work — an
agent-based simulation to find the recycle fraction and death rate at which item supply
stabilises with minting still worth doing, before a single pixel is drawn.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python sim/economy.py
```

## Layout

| Path | What |
|---|---|
| `SPEC.md` | the source of truth |
| `sim/` | the economy simulation (`sim/out/` is gitignored) |
| `CLAUDE.md` | orientation, working agreements and measured facts for anyone (or anything) working here |
| `proto/visual/` | the visual slice — placeholder pixel art drawn in code, playable; open `index.html` |
| `art/` | the art bank — every sprite as data, with a gallery page; banked for dungeons after the first; open `index.html` |
