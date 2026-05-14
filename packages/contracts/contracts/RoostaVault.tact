// RoostaVault — per-user gasless proxy contract.
//
// === Purpose ===
// The vault is the user's on-chain identity and fund custody. The user signs
// exactly one real transaction (funding the vault); afterwards every Roosta
// action is a session-key-signed *intent* delivered by the backend relayer,
// which pays the TON gas. See docs/GASLESS_ARCHITECTURE.md.
//
// === Trust model ===
// * `owner`        — the user's real TonConnect wallet. Can always sweep funds
//                    via OwnerWithdraw regardless of session-key state.
// * `ownerPubKey`  — a session ed25519 key generated in the TMA. Signs intents.
//                    Compromise is bounded to the vault balance; owner recovers.
// * Relay is permissionless: anyone may deliver a VaultExecute. The ed25519
//   signature + monotonic `seqno` + `validUntil` are the only gates. The signed
//   cell includes `myAddress()` so an intent cannot be replayed on another vault.
//
// All amounts are nanoTON for the MVP (matches KyeContract). The vault forwards
// whatever the inner message needs, so a future jUSDT switch is additive.

import "@stdlib/deploy";

// --- Messages ---

// Relayer-delivered intent. `signature` covers the hash of
// (seqno, validUntil, target, amount, mode, myAddress(), body).
message VaultExecute {
    seqno: Int as uint64;
    validUntil: Int as uint32;
    target: Address;
    amount: Int as coins;
    mode: Int as uint8;
    body: Cell;
    signature: Slice;
}

// Owner-wallet escape hatch. Authorized by `sender() == owner`, no signature
// needed — the owner is signing a real transaction.
message OwnerWithdraw {
    queryId: Int as uint64;
}

// --- Events ---
message VaultDeployed { owner: Address; ownerPubKey: Int as uint256 }
message VaultFunded { from: Address; amount: Int as coins }
message VaultExecuted { seqno: Int as uint64; target: Address; amount: Int as coins }
message VaultWithdrawn { to: Address; amount: Int as coins }

// Gas the relayer must attach so the forwarded message and storage rent are
// covered without dipping below the self-keep reserve.
const MIN_RELAYER_GAS: Int = 30000000;  // 0.03 TON
const SELF_KEEP: Int = 50000000;        // 0.05 TON kept for storage rent

contract RoostaVault with Deployable {
    owner: Address;
    ownerPubKey: Int as uint256;
    seqno: Int as uint64;

    init(owner: Address, ownerPubKey: Int) {
        self.owner = owner;
        self.ownerPubKey = ownerPubKey;
        self.seqno = 0;
        emit(VaultDeployed{ owner: owner, ownerPubKey: ownerPubKey }.toCell());
    }

    // Accept plain TON: initial funding, top-ups, and incoming payouts/refunds
    // from KyeContract. Deploy{} bodies from the factory path also land here.
    receive() {
        emit(VaultFunded{ from: sender(), amount: context().value }.toCell());
    }

    receive(msg: Slice) {
        // Comment / unstructured transfers (e.g. wallet "send with message").
        emit(VaultFunded{ from: sender(), amount: context().value }.toCell());
    }

    // Relayer path. The relayer attaches gas; the vault forwards `amount` from
    // its own balance using SendPayGasSeparately so the user's deposited funds
    // cover only the real action cost.
    receive(msg: VaultExecute) {
        require(context().value >= MIN_RELAYER_GAS, "relayer gas too low");
        require(now() <= msg.validUntil, "intent expired");
        require(msg.seqno == self.seqno, "bad seqno");

        let signed: Cell = beginCell()
            .storeUint(msg.seqno, 64)
            .storeUint(msg.validUntil, 32)
            .storeAddress(msg.target)
            .storeCoins(msg.amount)
            .storeUint(msg.mode, 8)
            .storeAddress(myAddress())
            .storeRef(msg.body)
            .endCell();
        require(
            checkSignature(signed.hash(), msg.signature, self.ownerPubKey),
            "bad signature"
        );

        // Consume the seqno before any external effect (replay guard).
        self.seqno = self.seqno + 1;

        // Solvency: never let a forwarded amount drop the vault below the
        // storage-rent reserve. The relayer's incoming value is already in
        // balance at this point.
        let available: Int = myBalance() - SELF_KEEP;
        require(msg.amount <= available, "insufficient vault balance");

        send(SendParameters{
            to: msg.target,
            value: msg.amount,
            mode: SendPayGasSeparately,
            body: msg.body,
            bounce: true
        });
        emit(VaultExecuted{ seqno: msg.seqno, target: msg.target, amount: msg.amount }.toCell());
    }

    // Owner escape hatch: sweep everything back to the owner wallet. Works even
    // if the session key is lost — the owner is signing a real transaction.
    receive(msg: OwnerWithdraw) {
        require(sender() == self.owner, "only owner");
        let bal: Int = myBalance();
        // Emit before the sweep: SendRemainingBalance zeroes the balance, so any
        // action queued after it (the emit's external message) could not pay its
        // fee and would abort the action phase.
        emit(VaultWithdrawn{ to: self.owner, amount: bal }.toCell());
        // Leave nothing behind. Contract may be left uninitialized — that's fine,
        // it can be re-deployed deterministically.
        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendRemainingBalance | SendIgnoreErrors,
            bounce: false
        });
    }

    // --- Getters ---
    get fun ownerAddr(): Address { return self.owner; }
    get fun pubKey(): Int { return self.ownerPubKey; }
    get fun currentSeqno(): Int { return self.seqno; }
    get fun balance(): Int { return myBalance(); }
}
