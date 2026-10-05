// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/*
 * Measure.sol — A MEASURING STICK, NOT THE CONTRACTS. NOTHING SHOULD BE BUILT ON IT.
 *
 * Oubliette has no contracts (SPEC §8 step 5). This file exists so that gas.mjs can put a number on
 * each on-chain action the design implies — mint, equip, unequip, repair, consumables, two exchange
 * designs, and the operator's open / settle / roll — as a standalone transaction on RH Chain (4663).
 * It is written the way a first honest draft would be: one packed word per item, no heroic tricks.
 *
 * What it is NOT: audited, complete, or safe. Missing on purpose — safeTransferFrom and receiver
 * hooks, ERC-165, metadata, pausing, key rotation, reentrancy guards, signature-malleability checks,
 * any defence against a dishonest server, and every rule the game has not decided yet (SPEC §4).
 * Names, tiers, prices and the 5 % fee are placeholders. Compile target: evmVersion "cancun".
 *
 * ArbSys (0x64) exists only on the chain. In the local EVM gas.mjs mounts a stand-in precompile at
 * the same address and charges it the gas it measured on the live chain.
 */

interface IArbSys {
    function arbBlockNumber() external view returns (uint256);
    function arbBlockHash(uint256 arbBlockNum) external view returns (bytes32);
}

/// Minimal ERC-20 with burn. The game never mints it (SPEC §3.2): the constructor's supply is all there is.
contract Token {
    string public constant name = "Measure";
    string public constant symbol = "MSR";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(uint256 supply) {
        totalSupply = supply;
        balanceOf[msg.sender] = supply;
        emit Transfer(address(0), msg.sender, supply);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        _spend(from, value);
        _move(from, to, value);
        return true;
    }

    function burn(uint256 value) external {
        _burn(msg.sender, value);
    }

    function burnFrom(address from, uint256 value) external {
        _spend(from, value);
        _burn(from, value);
    }

    function _spend(address from, uint256 value) private {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) allowance[from][msg.sender] = a - value; // an infinite approval is never written
    }

    function _move(address from, address to, uint256 value) private {
        balanceOf[from] -= value;
        unchecked { balanceOf[to] += value; }
        emit Transfer(from, to, value);
    }

    function _burn(address from, uint256 value) private {
        balanceOf[from] -= value;
        unchecked { totalSupply -= value; }
        emit Transfer(from, address(0), value);
    }
}

/// Gear: a minimal ERC-721 whose token is one packed word, plus everything that touches that word —
/// mint, the wager (equip / unequip), repair, and the operator's run lifecycle.
contract Gear {
    // item word: owner (160) | kind (8) | tier (8) | durability (16) | state (8) | ref (32)
    //   ref = the last run whose wear has been applied (free / equipped), or the run whose loot pool holds it (pooled)
    uint256 private constant KIND_SHIFT = 160;
    uint256 private constant TIER_SHIFT = 168;
    uint256 private constant DUR_SHIFT = 176;
    uint256 private constant STATE_SHIFT = 192;
    uint256 private constant REF_SHIFT = 200;
    uint256 private constant DUR_MASK = uint256(0xffff) << DUR_SHIFT;
    uint256 private constant STATE_MASK = uint256(0xff) << STATE_SHIFT;
    uint256 private constant REF_MASK = uint256(0xffffffff) << REF_SHIFT;
    uint256 private constant FREE = 0;
    uint256 private constant EQUIPPED = 1;
    uint256 private constant POOLED = 2;
    // run word: openBlock (64) | rollBlock (64) | state (8) | pooled (16)
    uint256 private constant OPEN = 1;
    uint256 private constant SETTLED = 2;
    uint256 private constant ROLLED = 3;
    // a kit is one calldata word of four 64-bit lanes: item id (48) | wear (16); an empty lane is 0
    uint256 private constant LANE = type(uint64).max;
    uint256 private constant LANE_ID = type(uint48).max;

    uint256 public constant KINDS = 10;
    uint256 public constant UNEQUIP_DELAY = 10 minutes;
    bytes32 private constant VOUCHER = keccak256("Unequip(uint256 chain,address gear,address wallet,bytes32 ids,uint256 durs,uint256 expiry)");
    IArbSys private constant ARBSYS = IArbSys(address(0x64));

    struct Tier { uint88 mintCost; uint72 ethCost; uint80 repairCost; uint16 maxDur; } // one slot

    Token public immutable token;
    address public server;
    uint256 private _counters; // last item id (64) | treasury wei (128)
    mapping(uint256 => Tier) public tiers;
    mapping(uint256 => uint256) private _item;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(address => uint256) public unequipRequest; // readyAt (64) | hash of the ids (192); 1 = consumed
    mapping(address => uint256) public lastRun;        // design L only: the last run a wallet was listed in
    mapping(uint256 => bytes32) public runCommit;
    mapping(uint256 => uint256) public runMeta;
    mapping(uint256 => bytes32) public runResult;      // keccak(logHash, wearRoot, survivorsHash)

    event Transfer(address indexed from, address indexed to, uint256 indexed id);
    event Approval(address indexed owner, address indexed spender, uint256 indexed id);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event Equipped(address indexed wallet, uint256[] ids);
    event Unequipped(address indexed wallet, uint256[] ids);
    event UnequipRequested(address indexed wallet, uint256[] ids, uint256 readyAt);
    event Repaired(uint256 indexed id);
    event RunOpened(uint256 indexed runId, bytes32 commit);
    event Roster(uint256 indexed runId, address[] roster);
    event RunSettled(uint256 indexed runId, bytes32 logHash, bytes32 wearRoot);
    event LootRolled(uint256 indexed runId, bytes32 seed);

    constructor(Token token_, address server_) {
        token = token_;
        server = server_;
        tiers[1] = Tier(220e18, 0.0005 ether, 30e18, 100); // placeholders: sim v1 has t1 at ~220 token
        tiers[2] = Tier(660e18, 0.0015 ether, 60e18, 100);
        tiers[3] = Tier(1980e18, 0.0045 ether, 120e18, 100);
    }

    // ───────────────────────────── ERC-721, the minimum ─────────────────────────────

    function ownerOf(uint256 id) external view returns (address owner) {
        owner = address(uint160(_item[id]));
        require(owner != address(0), "no item");
    }

    function attrs(uint256 id) external view returns (uint8 kind, uint8 tier, uint16 dur, uint8 state) {
        uint256 w = _item[id];
        return (uint8(w >> KIND_SHIFT), uint8(w >> TIER_SHIFT), uint16(w >> DUR_SHIFT), uint8(w >> STATE_SHIFT));
    }

    function treasury() external view returns (uint256) {
        return _counters >> 64;
    }

    function approve(address spender, uint256 id) external {
        address owner = address(uint160(_item[id]));
        require(msg.sender == owner || isApprovedForAll[owner][msg.sender], "not owner");
        getApproved[id] = spender;
        emit Approval(owner, spender, id);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    /// Equipped and pooled gear does not move: that is the wager.
    function transferFrom(address from, address to, uint256 id) external {
        uint256 w = _item[id];
        require(address(uint160(w)) == from && (w & STATE_MASK) == 0 && to != address(0), "not free");
        require(msg.sender == from || isApprovedForAll[from][msg.sender] || getApproved[id] == msg.sender, "not approved");
        delete getApproved[id];
        _item[id] = (w & ~uint256(type(uint160).max)) | uint160(to);
        unchecked { --balanceOf[from]; ++balanceOf[to]; }
        emit Transfer(from, to, id);
    }

    // ───────────────────────────── P1 mint · P4 repair ─────────────────────────────

    /// P1. Burn the tier's token cost, bank the tier's ETH, mint one item at full durability.
    function mint(uint8 tier, uint8 kind) external payable returns (uint256 id) {
        Tier memory t = tiers[tier];
        require(t.maxDur != 0 && msg.value == t.ethCost && kind < KINDS, "bad mint");
        token.burnFrom(msg.sender, t.mintCost);
        uint256 c = _counters;
        id = uint64(c) + 1;
        _counters = c + 1 + (msg.value << 64);
        _item[id] = uint160(msg.sender) | (uint256(kind) << KIND_SHIFT) | (uint256(tier) << TIER_SHIFT)
            | (uint256(t.maxDur) << DUR_SHIFT);
        unchecked { ++balanceOf[msg.sender]; }
        emit Transfer(address(0), msg.sender, id);
    }

    /// P4. Burn the tier's repair cost, restore durability. (SPEC §3.5 routes this through a repair kit;
    /// the kit's own mint and burn are P5.)
    function repair(uint256 id) external {
        uint256 w = _item[id];
        require(address(uint160(w)) == msg.sender, "not owner");
        Tier memory t = tiers[uint8(w >> TIER_SHIFT)];
        token.burnFrom(msg.sender, t.repairCost);
        _item[id] = (w & ~DUR_MASK) | (uint256(t.maxDur) << DUR_SHIFT);
        emit Repaired(id);
    }

    // ───────────────────────────── P2 equip · P3 unequip ─────────────────────────────

    /// P2. Lock gear as the wager.
    function equip(uint256[] calldata ids) external {
        for (uint256 i; i < ids.length; ++i) {
            uint256 w = _item[ids[i]];
            require(address(uint160(w)) == msg.sender && (w & STATE_MASK) == 0 && (w & DUR_MASK) != 0, "cannot equip");
            _item[ids[i]] = w | (EQUIPPED << STATE_SHIFT);
        }
        emit Equipped(msg.sender, ids);
    }

    /// P3a. Immediate: the server signs "this wallet is in no run" over the wallet, the ids and a short expiry.
    /// No nonce is stored — the server admits the wallet to no run until the voucher has expired.
    /// `durs` (16 bits per item, 0 = leave alone) is how lazy durability arrives: the same voucher carries
    /// each item's durability after the runs it was in, checkable by anyone against the settled logs.
    function unequip(uint256[] calldata ids, uint256 durs, uint256 expiry, uint8 v, bytes32 r, bytes32 s) external {
        require(block.timestamp <= expiry, "expired");
        bytes32 digest = keccak256(abi.encode(
            VOUCHER, block.chainid, address(this), msg.sender, keccak256(abi.encodePacked(ids)), durs, expiry
        ));
        require(ecrecover(digest, v, r, s) == server, "bad voucher");
        _release(ids, durs);
    }

    /// P3b, step 1. No server needed: ask, then wait out UNEQUIP_DELAY (longer than any run plus its settle).
    /// The gear stays equipped — and at risk — until step 2.
    function requestUnequip(uint256[] calldata ids) external {
        uint256 readyAt = block.timestamp + UNEQUIP_DELAY;
        unequipRequest[msg.sender] = uint64(readyAt) | (uint256(keccak256(abi.encodePacked(ids))) << 64);
        emit UnequipRequested(msg.sender, ids, readyAt);
    }

    /// P3b, step 2.
    function finaliseUnequip(uint256[] calldata ids) external {
        uint256 q = unequipRequest[msg.sender];
        require(q > 1 && block.timestamp >= uint64(q) && (q >> 64) == (uint256(keccak256(abi.encodePacked(ids))) << 64) >> 64, "not ready");
        unequipRequest[msg.sender] = 1; // kept non-zero: the next request rewrites a warm slot's worth, not a fresh one
        _release(ids, 0);
    }

    /// P3c. Only under design L (rosters listed on chain): the chain itself knows the wallet's last run is over.
    function unequipListed(uint256[] calldata ids) external {
        require(uint8(runMeta[lastRun[msg.sender]] >> 128) != OPEN, "in a run");
        _release(ids, 0);
    }

    function _release(uint256[] calldata ids, uint256 durs) private {
        for (uint256 i; i < ids.length; ++i) {
            uint256 w = _item[ids[i]];
            require(address(uint160(w)) == msg.sender && (w & STATE_MASK) == EQUIPPED << STATE_SHIFT, "not equipped");
            w &= ~STATE_MASK;
            if (durs != 0) w = (w & ~DUR_MASK) | (((durs >> (16 * i)) & 0xffff) << DUR_SHIFT);
            _item[ids[i]] = w;
        }
        emit Unequipped(msg.sender, ids);
    }

    /// The lazy route without a server signature: prove one item's durability after `runId` against that run's
    /// wear root. Sorted-pair Merkle tree; the leaf is keccak(runId, id, durAfter). Open problem, not solved
    /// here: nothing on chain says `runId` was the item's LAST run — see the report.
    function syncWear(uint256 id, uint32 runId, uint16 durAfter, bytes32 logHash, bytes32 survivorsHash, bytes32[] calldata proof) external {
        bytes32 node = keccak256(abi.encode(runId, id, durAfter));
        for (uint256 i; i < proof.length; ++i) {
            bytes32 p = proof[i];
            node = node < p ? keccak256(abi.encode(node, p)) : keccak256(abi.encode(p, node));
        }
        require(runResult[runId] == keccak256(abi.encode(logHash, node, survivorsHash)), "bad proof");
        uint256 w = _item[id];
        require(uint32(w >> REF_SHIFT) < runId && (w & STATE_MASK) != POOLED << STATE_SHIFT, "stale");
        _item[id] = (w & ~(DUR_MASK | REF_MASK)) | (uint256(durAfter) << DUR_SHIFT) | (uint256(runId) << REF_SHIFT);
    }

    // ───────────────────────────── S1 open ─────────────────────────────

    modifier onlyServer() {
        require(msg.sender == server, "not server");
        _;
    }

    /// S1, design H. One commitment and the L2 block. The roster is not on chain: the server folds its hash
    /// into `commit`, and a replayer checks it.
    function openRun(uint32 runId, bytes32 commit) external onlyServer {
        _open(runId, commit);
    }

    /// S1, design E. The roster goes on chain as data (calldata and an event), not as state.
    function openRunLogged(uint32 runId, bytes32 commit, address[] calldata roster) external onlyServer {
        _open(runId, commit);
        emit Roster(runId, roster);
    }

    /// S1, design L. Every wallet is marked in storage, so the chain can answer "is this wallet in a run?".
    /// Not checked here: that each wallet's previous run is closed (one more cold read per wallet, 2,100 gas).
    function openRunListed(uint32 runId, bytes32 commit, address[] calldata roster) external onlyServer {
        _open(runId, commit);
        for (uint256 i; i < roster.length; ++i) lastRun[roster[i]] = runId;
    }

    function _open(uint32 runId, bytes32 commit) private {
        require(runId != 0 && runMeta[runId] == 0, "run exists");
        runCommit[runId] = commit;
        runMeta[runId] = uint64(ARBSYS.arbBlockNumber()) | (OPEN << 128);
        emit RunOpened(runId, commit);
    }

    // ───────────────────────────── S2 / S4 settle ─────────────────────────────

    /// S2. dead[i]      = wallet | poolBits << 160  (bit j set: item j of the kit goes to the loot pool; else burned)
    ///     deadKits[i]  = that wallet's kit
    ///     survivors[i] = wallet | weight << 160    (the contribution weight for the loot roll)
    ///     kits[i]      = survivor i's kit with a wear per item — EAGER durability. Pass an empty array for LAZY:
    ///                    then only `wearRoot` is recorded and no survivor item is touched.
    /// Stores one word (the hash of the log hash, the wear root and the survivor list) and updates the run word.
    function settleRun(
        uint32 runId, bytes32 logHash, bytes32 wearRoot,
        uint256[] calldata dead, uint256[] calldata deadKits,
        uint256[] calldata survivors, uint256[] calldata kits
    ) external onlyServer {
        uint256 m = runMeta[runId];
        require(uint8(m >> 128) == OPEN, "not open");
        uint256 pooled = _settleDead(runId, dead, deadKits);
        if (kits.length != 0) _wear(survivors, kits);
        runResult[runId] = keccak256(abi.encode(logHash, wearRoot, keccak256(abi.encodePacked(survivors))));
        // the roll is seeded by the hash of THIS block, which nobody has until the block is sealed
        runMeta[runId] = uint64(m) | (uint256(uint64(ARBSYS.arbBlockNumber())) << 64) | (SETTLED << 128) | (pooled << 136);
        emit RunSettled(runId, logHash, wearRoot);
    }

    function _settleDead(uint32 runId, uint256[] calldata dead, uint256[] calldata deadKits) private returns (uint256 pooled) {
        for (uint256 i; i < dead.length; ++i) {
            address wallet = address(uint160(dead[i]));
            uint256 kit = deadKits[i];
            uint256 lost;
            for (uint256 j; j < 4; ++j) {
                uint256 id = (kit >> (64 * j)) & LANE_ID;
                if (id == 0) continue;
                uint256 w = _item[id];
                require(address(uint160(w)) == wallet && (w & STATE_MASK) == EQUIPPED << STATE_SHIFT, "dead: not worn");
                if ((dead[i] >> (160 + j)) & 1 == 1) {
                    // recycled: the contract holds it for this run's roll
                    _item[id] = (w & ~(uint256(type(uint160).max) | STATE_MASK | REF_MASK))
                        | uint160(address(this)) | (POOLED << STATE_SHIFT) | (uint256(runId) << REF_SHIFT);
                    emit Transfer(wallet, address(this), id);
                    ++pooled;
                } else {
                    delete _item[id]; // destroyed: the sink
                    emit Transfer(wallet, address(0), id);
                }
                ++lost;
            }
            balanceOf[wallet] -= lost;
        }
        if (pooled != 0) balanceOf[address(this)] += pooled;
    }

    function _wear(uint256[] calldata survivors, uint256[] calldata kits) private {
        for (uint256 i; i < kits.length; ++i) {
            address wallet = address(uint160(survivors[i]));
            uint256 kit = kits[i];
            for (uint256 j; j < 4; ++j) {
                uint256 lane = (kit >> (64 * j)) & LANE;
                if (lane == 0) continue;
                uint256 w = _item[lane & LANE_ID];
                require(address(uint160(w)) == wallet && (w & STATE_MASK) == EQUIPPED << STATE_SHIFT, "survivor: not worn");
                uint256 d = (w & DUR_MASK) >> DUR_SHIFT;
                uint256 wear = lane >> 48;
                d = d > wear ? d - wear : 0;
                _item[lane & LANE_ID] = (w & ~DUR_MASK) | (d << DUR_SHIFT);
            }
        }
    }

    // ───────────────────────────── S3 roll ─────────────────────────────

    /// S3. Anyone may call: the outcome is a function of chain data. Winners are drawn in proportion to weight,
    /// without replacement, from the hash of the block the settle landed in. ArbSys serves the last 256 L2
    /// blocks only (~25 s on this chain) — outside that window this reverts and a real contract needs another
    /// source (the EIP-2935 history contract; see the report).
    function rollLoot(uint32 runId, bytes32 logHash, bytes32 wearRoot, uint256[] calldata survivors, uint256[] calldata pool) external {
        uint256 m = runMeta[runId];
        require(uint8(m >> 128) == SETTLED && pool.length == uint16(m >> 136) && pool.length <= survivors.length, "not settled");
        require(runResult[runId] == keccak256(abi.encode(logHash, wearRoot, keccak256(abi.encodePacked(survivors)))), "bad survivors");
        bytes32 seed = ARBSYS.arbBlockHash(uint64(m >> 64));
        _draw(runId, seed, survivors, pool);
        balanceOf[address(this)] -= pool.length;
        runMeta[runId] = (m & ~(uint256(0xff) << 128)) | (ROLLED << 128);
        emit LootRolled(runId, seed);
    }

    function _draw(uint32 runId, bytes32 seed, uint256[] calldata survivors, uint256[] calldata pool) private {
        uint256[] memory weight = new uint256[](survivors.length);
        uint256 total;
        for (uint256 i; i < weight.length; ++i) {
            weight[i] = (survivors[i] >> 160) & 0xffff;
            total += weight[i];
        }
        for (uint256 k; k < pool.length; ++k) {
            uint256 w = _item[pool[k]];
            require((w & STATE_MASK) == POOLED << STATE_SHIFT && uint32(w >> REF_SHIFT) == runId, "not in this pool");
            uint256 i = _pick(weight, uint256(keccak256(abi.encode(seed, runId, k))) % total);
            total -= weight[i];
            weight[i] = 0; // without replacement
            address winner = address(uint160(survivors[i]));
            _item[pool[k]] = (w & ~(uint256(type(uint160).max) | STATE_MASK)) | uint160(winner); // free, in the winner's vault
            unchecked { ++balanceOf[winner]; }
            emit Transfer(address(this), winner, pool[k]);
        }
    }

    function _pick(uint256[] memory weight, uint256 r) private pure returns (uint256 i) {
        while (r >= weight[i]) {
            r -= weight[i];
            ++i;
        }
    }
}

/// Consumables: a minimal ERC-1155. Minted by burning the token, burned on use.
contract Items {
    Token public immutable token;
    mapping(uint256 => mapping(address => uint256)) public balanceOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => uint256) public cost; // token burned per unit; 0 = not mintable

    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    constructor(Token token_) {
        token = token_;
        cost[1] = 30e18; // repair kit
        cost[2] = 5e18;  // potion
    }

    /// P5, mint.
    function mint(uint256 id, uint256 amount) external {
        uint256 c = cost[id];
        require(c != 0, "no such item");
        token.burnFrom(msg.sender, c * amount);
        balanceOf[id][msg.sender] += amount;
        emit TransferSingle(msg.sender, address(0), msg.sender, id, amount);
    }

    /// P5, use.
    function use(uint256 id, uint256 amount) external {
        balanceOf[id][msg.sender] -= amount;
        emit TransferSingle(msg.sender, msg.sender, address(0), id, amount);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) external {
        require(msg.sender == from || isApprovedForAll[from][msg.sender], "not approved");
        balanceOf[id][from] -= amount;
        balanceOf[id][to] += amount;
        emit TransferSingle(msg.sender, from, to, id, amount); // no receiver hook: a measuring stick
    }
}

/// P6, exchange design A: the offer book lives on chain. Sell offers escrow the item, buy offers escrow the
/// token; a taker fills one named offer. No matching engine — "matched by the contract" (SPEC §3.7) would add
/// a search over the book on top of these numbers.
contract ExchangeA {
    uint256 public constant FEE_BPS = 500;
    Token public immutable token;
    Gear public immutable gear;
    mapping(uint256 => uint256) public sells; // item id => seller (160) | price in wei (96)
    mapping(uint256 => uint256) public buys;  // offer id => buyer (160) | price in gwei (64) | kind (8) | tier (8) | minDur (16)
    uint256 public lastBuy;

    event SellPlaced(uint256 indexed id, address indexed seller, uint256 price);
    event SellCancelled(uint256 indexed id);
    event BuyPlaced(uint256 indexed offer, address indexed buyer, uint256 terms);
    event BuyCancelled(uint256 indexed offer);
    event Trade(uint256 indexed id, address indexed seller, address indexed buyer, uint256 price);

    constructor(Token token_, Gear gear_) {
        token = token_;
        gear = gear_;
    }

    function placeSell(uint256 id, uint96 price) external {
        gear.transferFrom(msg.sender, address(this), id); // escrow; reverts unless free and approved
        sells[id] = uint160(msg.sender) | (uint256(price) << 160);
        emit SellPlaced(id, msg.sender, price);
    }

    function cancelSell(uint256 id) external {
        require(address(uint160(sells[id])) == msg.sender, "not seller");
        delete sells[id];
        gear.transferFrom(address(this), msg.sender, id);
        emit SellCancelled(id);
    }

    /// Taker buys. Token: taker -> seller, fee burned. Item: escrow -> taker.
    function fillSell(uint256 id, uint256 price) external {
        uint256 o = sells[id];
        address seller = address(uint160(o));
        require(seller != address(0) && o >> 160 == price, "no such offer");
        delete sells[id];
        uint256 fee = price * FEE_BPS / 10_000;
        token.transferFrom(msg.sender, seller, price - fee);
        token.burnFrom(msg.sender, fee);
        gear.transferFrom(address(this), msg.sender, id);
        emit Trade(id, seller, msg.sender, price);
    }

    function placeBuy(uint8 kind, uint8 tier, uint16 minDur, uint64 priceGwei) external returns (uint256 offer) {
        token.transferFrom(msg.sender, address(this), uint256(priceGwei) * 1 gwei); // escrow
        offer = ++lastBuy;
        uint256 terms = uint160(msg.sender) | (uint256(priceGwei) << 160) | (uint256(kind) << 224)
            | (uint256(tier) << 232) | (uint256(minDur) << 240);
        buys[offer] = terms;
        emit BuyPlaced(offer, msg.sender, terms);
    }

    function cancelBuy(uint256 offer) external {
        uint256 o = buys[offer];
        require(address(uint160(o)) == msg.sender, "not buyer");
        delete buys[offer];
        token.transfer(msg.sender, uint256(uint64(o >> 160)) * 1 gwei);
        emit BuyCancelled(offer);
    }

    /// Taker sells any item that meets the offer's terms. Item: taker -> buyer. Token: escrow -> taker, fee burned.
    function fillBuy(uint256 offer, uint256 id) external {
        uint256 o = buys[offer];
        address buyer = address(uint160(o));
        require(buyer != address(0), "no such offer");
        (uint8 kind, uint8 tier, uint16 dur,) = gear.attrs(id);
        require(kind == uint8(o >> 224) && tier == uint8(o >> 232) && dur >= uint16(o >> 240), "wrong item");
        delete buys[offer];
        uint256 price = uint256(uint64(o >> 160)) * 1 gwei;
        uint256 fee = price * FEE_BPS / 10_000;
        gear.transferFrom(msg.sender, buyer, id);
        token.transfer(msg.sender, price - fee);
        token.burn(fee);
        emit Trade(id, msg.sender, buyer, price);
    }
}

/// P7, exchange design B: the book is off chain. A maker signs an EIP-712 order; a taker brings it on chain.
/// Nothing is escrowed — the item and the token move by allowance at the fill. Nonces are a bitmap, 256 to a
/// storage word, so "mark the order used" is a fresh slot only once per 256 orders per maker.
contract ExchangeB {
    uint256 public constant FEE_BPS = 500;
    bytes32 public constant ORDER_TYPEHASH =
        keccak256("Order(address maker,bool sell,uint256 item,uint256 price,uint256 expiry,uint256 nonce)");
    bytes32 public immutable DOMAIN_SEPARATOR;
    Token public immutable token;
    Gear public immutable gear;
    mapping(address => mapping(uint256 => uint256)) public nonceBitmap;

    /// sell: `item` is the item id.  buy: `item` is kind (8) | tier (8) | minDur (16) and any matching item fills it.
    struct Order { address maker; bool sell; uint256 item; uint256 price; uint256 expiry; uint256 nonce; }

    event Trade(uint256 indexed id, address indexed seller, address indexed buyer, uint256 price);
    event Cancelled(address indexed maker, uint256 nonce);

    constructor(Token token_, Gear gear_) {
        token = token_;
        gear = gear_;
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("Oubliette measuring stick"), keccak256("0"), block.chainid, address(this)
        ));
    }

    function fill(Order calldata o, uint8 v, bytes32 r, bytes32 s, uint256 id) external {
        require(block.timestamp <= o.expiry, "expired");
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01", DOMAIN_SEPARATOR,
            keccak256(abi.encode(ORDER_TYPEHASH, o.maker, o.sell, o.item, o.price, o.expiry, o.nonce))
        ));
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0) && signer == o.maker, "bad signature");
        _use(o.maker, o.nonce);
        uint256 fee = o.price * FEE_BPS / 10_000;
        if (o.sell) {
            require(id == o.item, "wrong item");
            token.transferFrom(msg.sender, o.maker, o.price - fee);
            token.burnFrom(msg.sender, fee);
            gear.transferFrom(o.maker, msg.sender, id);
            emit Trade(id, o.maker, msg.sender, o.price);
        } else {
            (uint8 kind, uint8 tier, uint16 dur,) = gear.attrs(id);
            require(kind == uint8(o.item) && tier == uint8(o.item >> 8) && dur >= uint16(o.item >> 16), "wrong item");
            token.transferFrom(o.maker, msg.sender, o.price - fee);
            token.burnFrom(o.maker, fee);
            gear.transferFrom(msg.sender, o.maker, id);
            emit Trade(id, msg.sender, o.maker, o.price);
        }
    }

    /// The only cancel a maker need not trust anyone for.
    function cancel(uint256 nonce) external {
        _use(msg.sender, nonce);
        emit Cancelled(msg.sender, nonce);
    }

    function _use(address maker, uint256 nonce) private {
        uint256 word = nonceBitmap[maker][nonce >> 8];
        uint256 bit = 1 << (nonce & 0xff);
        require(word & bit == 0, "order used");
        nonceBitmap[maker][nonce >> 8] = word | bit;
    }
}

/// Calibration only: what the real ArbSys calls cost, measured on the live chain through a state override.
contract ArbProbe {
    uint256 public number;
    bytes32 public hash;

    function readNumber() external {
        number = IArbSys(address(0x64)).arbBlockNumber();
    }

    function readHash(uint256 back) external {
        hash = IArbSys(address(0x64)).arbBlockHash(IArbSys(address(0x64)).arbBlockNumber() - back);
    }

    /// The other on-chain source of L2 block hashes: the EIP-2935 history contract.
    function readHistory(uint256 back) external {
        uint256 n = IArbSys(address(0x64)).arbBlockNumber() - back;
        (bool ok, bytes memory out) = address(0x0000F90827F1C53a10cb7A02335B175320002935).staticcall(abi.encode(n));
        require(ok && out.length == 32, "no history");
        hash = abi.decode(out, (bytes32));
    }
}
