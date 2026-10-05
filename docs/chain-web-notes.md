# RH Chain as a home for Oubliette — web research notes (2026-10-03)

Scope: web only (WebSearch/WebFetch, curl, `gh api` on public repos). Every claim is tagged
SOURCED (URL opened today) or INFERRED. Facts the caller measured today (block cadence, fees,
precompiles, no VRF vendor on 4663, SNDK transfers freely, Pons mechanics, 16 chance apps on
DefiLlama) are reused, not re-measured. Pages that would not render (DefiLlama site 403,
Pyth Entropy chainlist "Loading", NGCB PDF unreadable without a PDF lib) are noted as such.

---

## A. RH Chain (Robinhood Chain, 4663)

### A1. Terms, policy, sequencer, governance, incidents

**Terms of Service** — https://docs.robinhood.com/chain/terms-of-service (SOURCED)
- "Last Updated: August 24, 2026". Covers the Sequencer and public RPC (mainnet), not only testnet.
- §2.1: "Robinhood Chain is a permissionless, Ethereum-compatible Layer-2 blockchain". Deployment
  is permissionless *in writing*.
- Prohibited uses (§2.3) are generic: activity that "violates or facilitates the violation of
  applicable laws", "Fraud or Deception", "Network Abuse or Security Violations". **No clause on
  gambling, games of chance, lotteries, sweepstakes or prize draws.** Securities language is
  confined to a trademark clause (§5.11: no Robinhood Chain marks "in connection with a token
  issuance, initial exchange offering, or similar fundraising event").
- §6: Robinhood "may ... limit, condition, or revoke access to the Services, including by
  restricting or blocking specific wallet addresses from participating on Robinhood Chain."
  §2.2: Robinhood "reserves the right to verify eligibility and deny or terminate access at its
  discretion." Governed by Delaware law.
- §2.1 on the sequencer: "The Robinhood Sequencer is non-custodial ... Robinhood makes no guarantee
  of uptime or continuous availability." §8.1 warns of "periodic protocol upgrades that could
  significantly alter chain operation". Nothing on Timeboost, forced inclusion or a decentralisation
  roadmap in the Terms.

**Docs: differences from Ethereum** — https://docs.robinhood.com/chain/differences-from-ethereum/ (SOURCED)
- Sequencing: "first-come, first-served model based on sequencer arrival time ... increasing your fee
  will not shift your transaction ahead of others". **No Timeboost** — consistent with the measured FCFS.
- **Transaction filtering is on, in writing:** "Robinhood Chain maintains compliance standards through
  sequencer-level screening." Blocked transactions "appear as though the event never occurred."
- `block.number` is an L1 estimate; `prevrandao`/`difficulty` constant; `blockhash(n)` "only reliable
  for recent blocks and unsuitable for randomness" (matches the §3.6 measurement). Code size 96 KB.

**Docs: governance** — https://docs.robinhood.com/chain/governance/ (SOURCED)
- Security Council of eight: "Routine actions require approval from six of the eight signers and are
  subject to a seven-day on-chain timelock ... Emergency actions bypass the timelock but require
  approval from seven of eight signers." Robinhood holds two seats; the other six are BitGo,
  Chainlink Labs, Fireblocks Trust Company, Offchain Labs, Paxos, Talos.
- "Robinhood Chain currently has two validators, operated by Offchain Labs and Alchemy." BoLD with a
  permissioned validator set. No decentralisation roadmap stated.

**Docs: notices & upgrades** — https://docs.robinhood.com/chain/notices-and-upgrades/ (SOURCED)
- 2026-09-14 Nitro v3.11.4; 2026-09-17 feed moves to compressed-only WebSocket (RFC 7692);
  2026-09-22 delayed backup sequencer feed (~500 ms behind). No ArbOS, fee or sequencer-policy
  notices. No outage notices.

**L2BEAT** — https://l2beat.com/scaling/projects/robinhood (SOURCED)
- Not Stage 0: "Fraud proof submission is not sufficiently decentralized". Sequencer failure: "No
  mechanism" — "transaction filtering can nullify force inclusion via the
  ArbFilteredTransactionsManager precompile"; authorised filterers can "forcibly fail those
  transactions, including force-included ones, without delay". Exit window "None" (instantly
  upgradeable). State validation: fraud proofs, 6d 8h challenge, whitelisted validators only.
  Proposer failure: self-propose after 28 d. DA: Ethereum blobs.
- Upgrade keys: Robinhood Multisig 1 (7/8) executes with no delay; Multisig 2 (6/8) behind a 7-day
  timelock (matches the governance page).
- TVS $2.71 B (canonical $781.85 M, native $747.42 M, external $1.18 B).
- "Four liveness anomalies detected in the last 30 days (5 to 8.5 minutes without data
  submissions)" and a "recent increase in filtered transaction hashes (278 to 6,088)". The
  filtering is live and growing, not theoretical.

**What the filter can do (Arbitrum docs)** — https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/sequencer/compliance-filtering (SOURCED)
- Rules: "Block any transaction originating from or to a restricted address"; "Block execution of
  ERC-20, ERC-721, and ERC-1155 transfers from or to a restricted address"; block CALL/CREATE/
  CREATE2/SELFDESTRUCT "targeting a restricted address"; block on "an arbitrary list of emitted
  events". Addresses are restricted, not contracts as such — but **a contract address can be
  restricted, which blocks every interaction with it chain-wide**, and the guardian precompile fails
  force-included transactions too. The chain owner picks the compliance provider (TRM/Chainalysis
  named as examples). Arbitrum activated this in ArbOS 61 "Elara" on Aug 20; it is "intentionally
  disabled on Arbitrum One and Nova" — https://thedefiant.io/news/blockchains/arbitrum-activates-elara-with-optional-compliance-filters-for-dedicated-chains (SOURCED)
- TRM lists Robinhood as a covered customer (screening, monitoring) —
  https://www.trmlabs.com/blockchain-coverage/robinhood (SOURCED). Chainalysis integration was
  announced at launch (kucoin blog, July 2026; INFERRED, secondary source).

**Decentralisation commentary** — https://cryptobriefing.com/arbitrum-robinhood-chain-decentralization-concerns/ (SOURCED, 2026-09-11)
- Concerns: Robinhood's sole sequencer, two whitelisted challengers, 7/8 multisig. Goldfeder
  (Offchain Labs) called them "solvable problems" and said decentralising the sequencer would close
  the censorship gap. **No Robinhood statement** on a roadmap, Timeboost or filtering policy.

**Incidents**
- 2026-09-04 (Friday): block production "continued uninterrupted, with blocks generated every 101
  milliseconds"; blobs failed to reach Ethereum for 14 minutes in two gaps; Arbitrum blamed the blob
  market for the second gap, the first is unexplained —
  https://thedefiant.io/news/blockchains/robinhood-chain-never-stopped-but-its-blobs-did-stop-reaching-ethereum-for-14-minutes (SOURCED).
  Several outlets reported it as a 14-minute halt with ~8,400 missed blocks
  (https://www.cryptometer.io/news/robinhood-chain-hit-by-14-minute-outage-as-block-production-stops/,
  SOURCED but contradicted by The Defiant's block-level read). Treat as: DA gap, likely not a
  sequencer halt; the L2BEAT liveness anomalies are the same class.
- No removal / blocking / front-end delisting of an app found. Closest: Robinhood Wallet's public
  "we do not endorse third-party tokens" disclaimer that sent $WALLET from $84 M to ~$9 M
  (https://cryptobriefing.com/robinhood-wallet-token-crashes-90-percent/, SOURCED); Vlad.fun
  launchpad self-suspended over an "internal integrity issue"
  (https://cointelegraph.com/news/robinhood-chain-memecoin-vladfun-halts-integrity, SOURCED).
  The 278→6,088 filtered-hash growth on L2BEAT is the only hard evidence of blocking, and its
  targets are not public (salted hashes).

**Robinhood's own posture on chance products (INFERRED relevance, SOURCED facts)**
- Robinhood sells Kalshi event contracts and sued Washington State (2026-04-01) to defend them;
  Massachusetts, Nevada, Michigan, Arizona and Washington have sued Kalshi; three California tribes
  sued Kalshi and Robinhood (2026-09-08) —
  https://sbcamericas.com/2026/04/01/robinhood-sues-washington-state/,
  https://frontofficesports.com/article/california-tribes-sue-kalshi-and-robinhood/ (SOURCED).
  Reading: the operator litigates *for* chance-shaped products under federal pre-emption; it is not
  squeamish, but it is under live state-gambling scrutiny, which is the environment the game would
  share.

### A2. Stock tokens

- Issuer/terms: "tokenized debt securities issued by Robinhood Assets (Jersey) Limited"; "may not be
  offered, sold or delivered within the United States to, or for the account or benefit of, U.S.
  Persons"; restricted also in Canada, UK, Switzerland (+ UAE and sanctioned jurisdictions per
  DefiPrime) — https://docs.robinhood.com/rhj/faq, https://defiprime.com/robinhood-chain (SOURCED).
- **Primary access is institutional only:** "Only Authorised Participants (at issuance, the only
  Authorised Participant is BBVI) may subscribe for Stock Tokens directly from RHJ after KYB
  onboarding" — https://docs.robinhood.com/chain/stock-tokens/ (SOURCED). Retail acquires on the
  secondary market (Robinhood Wallet, DEX, CEX). Redemption: sell in the secondary market, or redeem
  with the Issuer after KYC/AML (FAQ, SOURCED).
- **Secondary transfer in the terms:** the chain docs say "End users may still buy and sell Stock
  Tokens on-chain outside the tokenization window", "Standard ERC-20 interface", and invite builders
  to "Enable trading" and compose; the product page says tokens are "compatible with popular
  self-custody wallets like Robinhood Wallet, Trust Wallet, Safepal" and can be swapped on "DEXs, or
  centralized exchanges" — https://robinhood.com/rhj/stocktokens/ (SOURCED). **Nothing in the FAQ,
  chain docs or product page addresses transfers to ineligible persons, use in apps, or use as
  prizes** — the US-person bar is on offer/sale/delivery by the issuer, enforced at the front end
  (caller's measured fact). The kucoin blog's claim that tokens "transfer only between whitelisted
  wallets" is contradicted by the caller's live SNDK transfer test; disregard it.
- Count: "190+ Stock Tokens" (product page, SOURCED); 195 on chain, 194 ever minted, 193 traded as
  of 2026-08-30 — https://sqd.dev/learn/robinhood-stock-token-volume/ (SOURCED). The docs' canonical
  list is a dynamic table at https://docs.robinhood.com/chain/contracts/ (did not render; "a token
  with a matching name/ticker but a different contract address is not a Robinhood Stock Token").
- Tokenisation window: Monday 02:00 CET – Saturday 02:00 CET; per-asset `tradingCapabilities` via
  the assets API (chain docs, SOURCED).
- Depth (SQD, SOURCED): $2.21 B lifetime stock-token DEX volume to 2026-08-30, $1.69 B of it in
  August, $270.6 M peak day (Aug 30). Mostly Uniswap v4/v3/v2; 54.7 % vs USDG/USDe, 32.1 % vs
  memecoins, 8.5 % vs ETH. NVDA $706 M lifetime, SPY $310 M, SPCX $303 M. A tail pair (SPY/NVDA
  Uniswap v3) shows $3.35 K/24 h — https://dexpaprika.com/robinhood/pool/0x55942b9b4c2f034062c13eeb40f5bb503b7a6c30
  (SOURCED). Record RWA day $85 M on Aug 25 (cryptobriefing, SOURCED). Depth is concentrated in a
  handful of names; fine for buying small prizes in NVDA/SPY, thin elsewhere.
- Gating/compliance changes since August 2026: **none found** in docs, FAQ, product page or news.
  The only dated post-August items are the Sept 14/17/22 node notices.

### A3. Who is on the chain, and the stack

- Activity (growthepie, as of 2026-10-02, i.e. **after** the gas subsidy ended on 2026-09-29):
  7.7 M daily transactions (+3.3 % WoW, #2 of 27 chains), 383.9 K daily active addresses (−7.5 %
  WoW), stablecoin supply $1.07 B, fees paid $82 K/day (−53 % WoW) —
  https://www.growthepie.com/chains/robinhood (SOURCED). dRPC on 2026-09-06: 7.5 M tx, 345.7 K DAA,
  DeFi TVL $908.65 M, 24 h DEX volume $1.37 B, 7-day $10.42 B —
  https://blog.drpc.org/robinhood-chain-two-months-onchain-activity/ (SOURCED). Peaks: 11.6 M tx/day
  (The Block, 2026-08-11); $1.6 B DEX day (Sept 1).
- Subsidy and revenue: Robinhood covered gas for Robinhood Wallet users for the first 90 days, ending
  ~Sept 29; chain revenue fell 83 % to $1.06 M on Sept 11 from a >$4 M peak; weekly fee average
  $5.93 M/day vs $12.44 M monthly before the cut-off —
  https://cryptobriefing.com/robinhood-chain-revenue-falls-83-percent/,
  https://cryptoticker.io/en/robinhood-chain-ecosystem-end-of-free-gas/ (SOURCED). Transactions did
  not collapse in the first three post-subsidy days (growthepie above); fees paid did (−53 %).
- Bridged value: L2BEAT TVS $2.71 B (above); $1.578 B bridged by August (cryptobriefing, SOURCED).
- On-ramps: Robinhood Wallet is a self-custody wallet "embedded in the Robinhood app" (Privy
  infrastructure), live in 120+ countries, with stock tokens, DEX swaps and dApps; it was the
  subsidised path — https://privy.io/blog/bringing-global-financial-markets-onchain-with-robinhood
  (SOURCED, 2026-07-15); Arbitrum factsheet: "self-custody through the Robinhood Wallet", "24/7
  trading in more than 120 countries" —
  https://forum.arbitrum.foundation/t/arbitrumdao-factsheet-robinhood-chain-mainnet-launch/31041
  (SOURCED). **Whether a US brokerage customer can withdraw ETH straight to 4663 is not stated
  anywhere I opened** (could not verify).
- Bridges (docs, SOURCED): Arbitrum canonical bridge, LayerZero OFT/Stargate, Chainlink
  CCIP/Transporter, Relay, Across, LiFi/0x — https://docs.robinhood.com/chain/bridging/.
- Account abstraction (docs, SOURCED): "first-class support for ERC-4337"; EntryPoints v0.6
  `0x5FF1…2789`, v0.7 `0x0000…a032`, v0.8 `0x4337…f108`; "supports EIP-7702, which lets existing
  externally-owned accounts delegate to smart contract code — so users can get smart-account
  features (batching, sponsorship, session keys)"; vendors named: Alchemy (wallets, bundler, gas
  manager), ZeroDev, Privy, Dynamic — https://docs.robinhood.com/chain/account-abstraction/.
  Pimlico lists "Chain ID: 4663, Slug: robinhood, EIP-7702 support: ✅" —
  https://docs.pimlico.io/guides/supported-chains (SOURCED). Alchemy's chain page lists RPC, Bundler,
  Gas Manager, NFT API, Token API, Webhooks on 4663 — https://www.alchemy.com/rpc/robinhood.md
  (SOURCED). Privy: any EVM chain via custom config; ZeroDev/Dynamic/thirdweb chain pages 404'd or
  were not found (could not verify beyond Robinhood's own listing).
- Indexers: Goldsky — subgraphs, Turbo Pipelines, Edge RPC, Compose on mainnet 4663 —
  https://goldsky.com/chains/robinhood (SOURCED). Envio HyperSync — "Robinhood | 4663 |
  https://robinhood.hypersync.xyz" — https://docs.envio.dev/docs/HyperSync/hypersync-supported-networks
  (SOURCED). SQD has a Robinhood dataset (sqd.dev article above, SOURCED). The Graph / Ponder: not
  found (Ponder works on any RPC; INFERRED).
- NFT marketplace: OpenSea added Robinhood Chain (web + mobile, 27 chains); $1.05 M/24 h NFT volume
  on 2026-08-13, "more than twice" Ethereum's that day; Spritehood 44,444 sold out in 54 min for
  ~$1.28 M — https://cryptobriefing.com/robinhood-chain-surpasses-ethereum-nft-volume/ (SOURCED).
- Explorer/verification: Blockscout is the official explorer, robinhoodchain.blockscout.com, with
  the verification API at /api; Etherscan v2 does not support 4663 —
  https://docs.blockscout.com/robinhood-api.md, https://docs.robinhood.com/chain/deploy-smart-contracts
  (SOURCED). Third-party: 4663scan.io, Phalcon, Robinscan.
- Other infra named in docs: Chainlink (oracles, Data Streams), LayerZero, Uniswap, Morpho,
  Fireblocks, BitGo, Hypernative (address screening for builders —
  https://www.hypernative.io/insights/blog/hypernative-brings-real-time-security-to-robinhood-chain, SOURCED).

### A4. Games on the chain

- Announced/launching (https://www.blockchaingamer.biz/news/42971/web3-games-launching-robinhood-chain/,
  SOURCED, 2026-09-28): **Yield Fields** (farming game, Onchain Heroes founder; 3,333 Founding Deed
  NFTs, whitelist to Sept 28); **Gigaverse Online** (0xDith; cites "high liquidity", "no points/XP
  equivalent", "most interesting onchain ecosystem"); **Cambria** (multi-chain expansion; $41 M
  Genesis volume elsewhere). **Spy Inc. Agents** (on-chain espionage, 12-hour staked rounds; NFT
  drop Sept 15–22), plus mid-September NFT collections (World Wise Wizards, Chainycats, Wardlings) —
  https://nftcalendar.io/b/robinhood/ (SOURCED).
- Live earlier: **The Floor** ("onchain Wall Street strategy game", NFT operators, weekly token) —
  https://madeonsol.com/tools/the-floor (SOURCED, third-party listing). Randomness/chance apps per
  Tracking-tracker (2026-08-30, dated lead, INFERRED today): StonkPit's Ticker, diced.fun, Dice
  Protocol (single-EOA commit-reveal keepers), PitBonesTable — "three competitors, ~zero paying
  demand". Caller's DefiLlama measurement: 16 chance apps, three paying stock-token prizes.
- How they fared: **no outcome data found** for any game — all are days-to-weeks old. The chain's
  consumer story so far is memecoins paired with stock tokens (Artificial Inu on NVDA: $1.5 M →
  $135 M cap in August, ~$3.3 M in its NVDA pool —
  https://cryptobriefing.com/robinhood-chain-dex-volume-all-time-high/, SOURCED) and NFT mints, not
  games. No game is reported removed or blocked.

---

## B. Alternatives (compact)

Pyth Entropy mainnet deployments, read today from the Pyth contract store
(`contract_manager/src/store/contracts/EvmEntropyContracts.json`, via `gh api`, SOURCED): arbitrum,
base, abstract, monad, optimism, hyperevm, soneium, berachain, apechain, b3, sanko, etherlink, kaia,
sonic, ink. **Not** ronin, megaeth, immutable, robinhood. Chainlink VRF 2.5 mainnets
(https://docs.chain.link/vrf/v2-5/supported-networks, SOURCED): Arbitrum One, Base, Ronin, plus
Ethereum/OP/Polygon/Avalanche/BNB/Soneium. **Not** Abstract, Immutable, MegaETH, Monad, Robinhood,
Solana. drand on chain needs BLS12-381 precompiles (EIP-2537, Pectra): present on 4663 (caller's
measurement); on other EVM L2s it depends on their Pectra status (INFERRED per chain below).

| Chain | Fees / block time | Randomness | Tokenised stock | Gaming audience & distribution | AA / session keys | Launch venue | Chance-app stance | Platform risk |
|---|---|---|---|---|---|---|---|---|
| **Arbitrum One** | 250 ms blocks; Timeboost live since Apr 2025 (express lane, 200 ms delay for others, $1.93 M fees Q4'25) — theblock.co/post/361058 (SOURCED). Fees cents (INFERRED) | Chainlink VRF 2.5 + Pyth Entropy (SOURCED); arbBlockHash same primitive (INFERRED, same stack) | Dinari dShares (KYC-gated issue/redeem, transfer blacklist) — docs.dinari.com (SOURCED); xStocks "live on … Arbitrum" per Sentora/eco (SOURCED secondary); no Robinhood tokens | Treasure (95 % of Arbitrum gaming) **left for ZKsync** — decrypt.co/296085 (SOURCED). Thin now | All vendors; 7702 (INFERRED) | Any; no Pons | DAO chain; compliance filter "intentionally disabled" (SOURCED) | Low; Timeboost auction = MEV lane that touches a FCFS-dependent design (INFERRED) |
| **Base** | Flashblocks 200 ms (SOURCED theblock.co 2025-07-17); median tx $0.02 (growthepie via eco.com, SOURCED) | Chainlink VRF 2.5 + Pyth Entropy (SOURCED) | Dinari on Base (blockworks, SOURCED); Ondo GM not on Base (ETH/Sol/BNB only, SOURCED); xStocks Base per Sentora (secondary) | Largest EVM consumer base; Base App mini-apps "from games to prediction markets" (theblock.co/post/362713, SOURCED) | All vendors; 7702 (INFERRED) | Clanker/Zora/Bankr (INFERRED) | Base chain permissionless; Coinbase's prohibited-use policy bars gambling *for Coinbase accounts* (coinbase.com/legal/prohibited_use, SOURCED); NGCB civil action vs Coinbase 2026-02-03 exists (PDF unreadable) | Coinbase sequencer; policy drift risk for a lottery-shaped game inside the Base App (INFERRED) |
| **Abstract** | ~1.1 s blocks (INFERRED from Bigcoin halving maths); cents | Pyth Entropy (SOURCED; 29 K requests Feb–Mar 2026, $161 revenue) | None found | Real: Gigaverse $5.5 M revenue / 77 K players; Bigcoin >50 % of DEX volume (decrypt, SOURCED) | Native AGW (Abstract Global Wallet) session keys (INFERRED) | Any | Degen-tolerant by culture (INFERRED) | ZK-stack L2 run by Igloo; small; Gigaverse now also going to RH Chain (SOURCED) |
| **Ronin** | ~2 s blocks, negligible fees (dwellir/chainspect, SOURCED) | Native Ronin VRF (docs.roninchain.com/developers/tools/vrf, SOURCED) + Chainlink VRF 2.5 (SOURCED) | None | Pixels, The Machines Arena; "pervasively permissionless" since 2024 (decrypt, SOURCED); DAA figures conflict (19 K growthepie vs 1.2 M claims) | Ronin Wallet; AA via vendors (INFERRED) | Katana DEX; no launchpad of note (INFERRED) | Not stated | Sky Mavis chain; EVM sidechain, not an L2 (INFERRED) |
| **Immutable zkEVM** | **Drop:** company pivoted to AI marketing tools, two layoff rounds, Guild of Guardians maintenance-only (egamers/theblock, SOURCED); no VRF vendor found | | | | | | | |
| **Solana** | 400 ms slots held through Q2'26; ~$0.0005/tx (INFERRED); fees $155 M/qtr (21shares, SOURCED) | Switchboard / ORAO VRF (INFERRED, not opened today); no EVM blockhash primitive | **Best:** xStocks (Backed, free transfer after mint), Ondo GM 200+ names since 2026-01-21 (solana.com, SOURCED), PUSA/SpaceX tokens | 4.16 M DAU (2026-06-05, SOURCED) | Session keys via Magic Block / native (INFERRED) | pump.fun etc. | Permissive | Non-EVM: full rewrite of contracts + arbBlockHash replacement (slot hashes); not portable |
| **MegaETH** | Mainnet 2026-02-09; ~10 ms blocks, 100 K TPS claim (blockeden, SOURCED); MEGA TGE 2026-04-30 | **No VRF vendor found** (not in Pyth store, not Chainlink) | None found | "Real-time games" positioning; >50 apps at launch (SOURCED) | Privy lists MegaETH (SOURCED) | ? | Not stated | Young; Ethena-linked ("an Ethena trade wearing a blockchain", analysis piece); sequencer centralised (INFERRED) |
| **Monad** | 300 ms blocks, 600 ms finality, sub-cent (monad.xyz July 2026 highlights, SOURCED); TVL $410 M | Pyth Entropy (SOURCED) | None found | Trading-first; some games (INFERRED) | Privy lists Monad (SOURCED) | ? | Not stated | New L1; MON token politics (INFERRED) |
| **Own Orbit chain** | Same 100–250 ms blocks; you pay DA + 10 % of net protocol revenue to Arbitrum DAO under AEP (forum factsheet, SOURCED) | Same arbBlockHash primitive; your own sequencer = you are the trusted party (INFERRED) | Bridge Robinhood tokens in via LayerZero/CCIP — allowed by their ERC-20 nature (INFERRED) | Zero; you bring every user and every bridge | Any | None | Yours — and so is the regulatory exposure | RaaS dependency (Conduit/Caldera; pricing not opened); ops cost and empty-chain risk |

### Ranked shortlist — what would have to be true to beat RH Chain

1. **Base.** Beats RH Chain if (a) stock drops are not needed in v0 (true — SPEC §7 says the ETH
   treasury accumulates unspent) and (b) the game needs a consumer audience more than it needs a
   stock-token venue. Base has Chainlink VRF and Pyth Entropy for the lottery roll, 200 ms
   Flashblocks, every AA vendor, and the Base App as distribution. The loss: no in-ecosystem stock
   tokens (Dinari is KYC-gated; Ondo is not on Base), a Coinbase policy surface that bars gambling on
   its own accounts and is already in a Nevada enforcement action, and the arbBlockHash
   per-250 ms-block seed must be replaced by `blockhash` (OP Stack: real L2 hashes, 2 s cadence;
   INFERRED) or a VRF.
2. **Arbitrum One.** Beats RH Chain if the operator wants the identical Orbit stack (arbBlockHash,
   FCFS-plus-Timeboost, BoLD) without a regulated broker's filter and keys, and can accept a thin
   gaming audience. Compliance filtering is off by DAO decision; VRF vendors are present. Stock
   tokens only via Dinari (gated) or bridged Robinhood tokens.
3. **Abstract.** Beats RH Chain only if the pixel-RPG audience (Gigaverse, Bigcoin) is the whole
   go-to-market and stock drops are dropped for good. Pyth Entropy present, native session-key
   wallet. Small chain, no stock tokens, and its flagship studio is itself expanding to RH Chain.

Solana is the strongest stock-token venue (xStocks + Ondo GM, free transfer) but is a rewrite, not a
port. MegaETH has no VRF vendor and no stock tokens. Monad and Ronin have nothing the game needs
that Base lacks. Own Orbit chain is a later option, not a v0 one.

### Portability note — what in the design is chain-specific

- **`ArbSys(0x64).arbBlockHash(n)` per-tick seed (SPEC §3.4, §3.6):** Arbitrum-stack only
  (Arbitrum One, Nova, any Orbit chain). OP Stack chains give real L2 `blockhash` at 2 s (Flashblocks
  do not change the canonical block cadence — INFERRED); Solana uses slot hashes. Abstract the seed
  source behind one interface: `(height, hash)` from arbBlockHash on Arbitrum chains, `blockhash` on
  OP Stack, a VRF/Entropy callback elsewhere. The replay-verification property survives any source
  that is public and recorded.
- **Stock-token drops (§3.2, not v0):** Robinhood tokens exist only on 4663 natively; they are plain
  ERC-20s so they can be bridged (LayerZero/CCIP are in Robinhood's own bridge list), but the
  issuer's US-person bar and the Jersey debt-security framing travel with them. Off 4663 the
  substitutes are xStocks (Solana/BNB/Ethereum/Arbitrum/Base per secondary sources) or Ondo GM
  (Ethereum/Solana/BNB) — both exclude US persons too. Nothing in v0 depends on this.
- **Pons launchpad (token launch, §3.2):** 4663-specific (factory 0x7eD5…EC7e). Elsewhere: Clanker/
  Zora/Bankr on Base, pump.fun on Solana. The game's token mechanics (burn-only, no emissions) do
  not depend on the venue; only the launch and the ETH-creator-fee leg do.
- **Compliance filter and blockable addresses:** unique to 4663 among the EVM options
  (Arbitrum One has it disabled). A contract address on the restricted list is a chain-wide kill.
- **Gas subsidy and Robinhood Wallet distribution:** 4663-only, and the subsidy has ended.

---

## Could not verify (today)

- Whether a US Robinhood brokerage customer can move ETH directly onto 4663 (no page states it;
  Robinhood Wallet in 120+ countries is the stated path).
- The target list of the 6,088 filtered transaction hashes (salted; not public).
- ZeroDev, Dynamic and thirdweb chain pages for 4663 (404 / not found); only Robinhood's own
  AA page names ZeroDev and Dynamic.
- The Graph and Ponder support for 4663 (nothing found either way).
- Post-subsidy data beyond growthepie's 2026-10-02 snapshot; no article yet covers Oct 1–3.
- Outcome data for any game on 4663 (all launched in the last 2–3 weeks or are announcements).
- The Nevada Gaming Control Board action against Coinbase (PDF fetched, no text extractor available).
- Conduit/Caldera current pricing for an own Orbit chain; MegaETH and Monad fee levels in cents
  (only "sub-cent" claims); Abstract's exact block time (inferred 1.1 s).
- DefiLlama pages (403 to the fetcher); reused the caller's measurement instead.
