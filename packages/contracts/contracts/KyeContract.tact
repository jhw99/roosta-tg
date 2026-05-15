// KyeContract — single Kye (ROSCA) instance.
//
// === Design note on TON semantics ===
// TON smart contracts cannot pull funds. The "auto-debit" framing in the GSD is
// implemented here as a member-push model:
//   1. Each round, a member sends a `Contribute(round)` message with the
//      contribution amount attached as message value.
//   2. The contract records the deposit in `contributions[round*64+order]`.
//   3. `executeRound` checks which members pre-funded the current round.
//      Anyone who didn't is flagged as a defaulter; the configured default
//      policy then governs payout/pool behavior.
//
// All amounts are nanoTON for the MVP. Production switches to jUSDT jettons.
//
// State per GSD Section 4.2; receivers per GSD Section 4.3.
//
// === Invariant notes (post-audit pass #2) ===
// * Zero-sum is an aspiration. On the rare cross-round shortfall (ProRata
//   defaults combined with an extreme `timeAdjustmentMaxBps`), the contract
//   caps the per-round payout at the available `myBalance() - SELF_KEEP` and
//   emits `PayoutCapped(intended, actual, deficit)`. Solvency is preferred
//   over zero-sum. (F-01)
// * `Contribute` refunds any excess message value back to the sender. (F-03)
// * `EmergencyCancel` uses a pull-refund pattern: it computes `refunds[member]`
//   in O(N) state writes and stops there. Members claim their refund by
//   sending `ClaimRefund`. This avoids the O(N^2) action-limit problem. (F-02)
// * `ExecuteRound` enforces a grace window of `GRACE_WINDOW_SEC` after the
//   round becomes eligible before defaulters can be punished. (F-08)
// * `OrganizerCover` (policy=2) carries shortfalls in `pendingShortfall` and
//   pays the winner the full intended payout from the contract balance. If
//   the balance is insufficient the payout is capped (F-01 path) and
//   `OrganizerCoverShortfall` is emitted; the organizer can `TopUp` to
//   replenish. (F-05)

import "@stdlib/deploy";

// --- Messages ---
message KyeInit {
    organizer: Address;
    memberCount: Int as uint8;
    contribution: Int as coins;
    roundIntervalSec: Int as uint32;
    feeRateBps: Int as uint16;
    timeAdjustmentMaxBps: Int as uint16;
    defaultPolicy: Int as uint8;
    platformTreasury: Address;
    // F-13: address-determinism salt. Same params + different salt => different
    // child contract address, so a second deploy by the same organizer does not
    // collide with the first.
    salt: Int as uint64;
}

message JoinKye {
    orderNum: Int as uint8;
}

message Contribute {
    roundNum: Int as uint16;
}

message ExecuteRound {
    nonce: Int as uint32;
}

message EmergencyCancel {
    reason: Int as uint8;
}

message ClaimRefund {
    queryId: Int as uint64;
}

message TopUp {
    queryId: Int as uint64;
}

// --- Events (emit body opcodes) ---
message KyeCreated { organizer: Address; memberCount: Int as uint8 }
message MemberJoined { member: Address; orderNum: Int as uint8 }
message KyeActivated { startTimestamp: Int as uint32 }
message RoundExecuted { roundNum: Int as uint16; winner: Address; payout: Int as coins }
message DefaultDetected { member: Address; roundNum: Int as uint16 }
message PayoutSent { winner: Address; amount: Int as coins }
message FeeDistributed { platform: Int as coins; organizer: Int as coins }
message KyeCompleted { totalRounds: Int as uint16 }
message KyeCancelled { reason: Int as uint8 }
message ContributionReceived { member: Address; roundNum: Int as uint16; amount: Int as coins }
message PayoutCapped { roundNum: Int as uint16; intended: Int as coins; actual: Int as coins; deficit: Int as coins }
message OrganizerCoverShortfall { organizer: Address; roundNum: Int as uint16; deficit: Int as coins }
message RefundClaimed { member: Address; amount: Int as coins }
message RefundQueued { member: Address; amount: Int as coins }
message ToppedUp { from: Address; amount: Int as coins }

// Gas reserve per outgoing send for forward fees etc.
const GAS_PER_SEND: Int = 10000000;     // 0.01 TON
const SELF_KEEP: Int = 50000000;        // 0.05 TON kept for storage rent
const GAS_FORWARD_FEE: Int = 10000000;  // 0.01 TON minimum refund threshold
const GRACE_WINDOW_SEC: Int = 300;      // 5 min grace window after round becomes eligible

contract KyeContract with Deployable {
    organizer: Address;
    memberCount: Int as uint8;
    contribution: Int as coins;
    roundIntervalSec: Int as uint32;
    feeRateBps: Int as uint16;
    timeAdjustmentMaxBps: Int as uint16;
    defaultPolicy: Int as uint8;
    currentRound: Int as uint16;
    startTimestamp: Int as uint32;
    status: Int as uint8; // 0=Created, 1=Active, 2=Completed, 3=Cancelled
    platformTreasury: Address;
    joinedCount: Int as uint8;
    members: map<Int as uint8, Address>;
    // contribution tracking: key = roundNum * 64 + orderNum (since both <=30, <=64)
    contributions: map<Int as uint16, Bool>;
    // Pull-refund ledger: populated by EmergencyCancel and Cancel-policy paths.
    refunds: map<Address, Int as coins>;
    // OrganizerCover: accumulated shortfall the organizer is expected to top up.
    pendingShortfall: Int as coins;
    cancelledAt: Int as uint32;
    salt: Int as uint64;

    init(init: KyeInit) {
        require(init.memberCount >= 2 && init.memberCount <= 30, "N out of range");
        require(init.feeRateBps >= 200 && init.feeRateBps <= 10000, "fee out of range");
        require(init.timeAdjustmentMaxBps <= 10000, "alpha out of range");
        require(init.roundIntervalSec > 0, "bad interval");
        require(init.contribution > 0, "bad contribution");
        require(init.defaultPolicy <= 2, "bad policy");
        self.organizer = init.organizer;
        self.memberCount = init.memberCount;
        self.contribution = init.contribution;
        self.roundIntervalSec = init.roundIntervalSec;
        self.feeRateBps = init.feeRateBps;
        self.timeAdjustmentMaxBps = init.timeAdjustmentMaxBps;
        self.defaultPolicy = init.defaultPolicy;
        self.platformTreasury = init.platformTreasury;
        self.currentRound = 1;
        self.startTimestamp = 0;
        self.status = 0;
        self.joinedCount = 0;
        self.pendingShortfall = 0;
        self.cancelledAt = 0;
        self.salt = init.salt;
        emit(KyeCreated{ organizer: init.organizer, memberCount: init.memberCount }.toCell());
    }

    fun orderOfSender(): Int {
        let s: Address = sender();
        let i: Int = 1;
        while (i <= self.memberCount) {
            let mOpt: Address? = self.members.get(i);
            if (mOpt != null) {
                if ((mOpt!!) == s) {
                    return i;
                }
            }
            i = i + 1;
        }
        return 0;
    }

    receive(msg: JoinKye) {
        require(self.status == 0, "not joinable");
        require(msg.orderNum >= 1 && msg.orderNum <= self.memberCount, "bad order");
        require(self.members.get(msg.orderNum) == null, "slot taken");
        let s: Address = sender();
        // The organizer is allowed to also take a member slot (opt-in). They
        // still receive the organizer fee on every round; this just lets them
        // participate in the rotating payout too.
        // ensure not already joined under another slot
        let i: Int = 1;
        while (i <= self.memberCount) {
            let mOpt: Address? = self.members.get(i);
            if (mOpt != null) {
                require((mOpt!!) != s, "already joined");
            }
            i = i + 1;
        }
        self.members.set(msg.orderNum, s);
        self.joinedCount = self.joinedCount + 1;
        emit(MemberJoined{ member: s, orderNum: msg.orderNum }.toCell());
        if (self.joinedCount == self.memberCount) {
            self.status = 1;
            self.startTimestamp = now();
            emit(KyeActivated{ startTimestamp: now() }.toCell());
        }
    }

    receive(msg: Contribute) {
        require(self.status == 1, "not active");
        require(msg.roundNum == self.currentRound, "wrong round");
        let order: Int = self.orderOfSender();
        require(order > 0, "not a member");
        require(context().value >= self.contribution, "underpaid");
        let key: Int = msg.roundNum * 64 + order;
        require(self.contributions.get(key) == null, "already contributed");
        self.contributions.set(key, true);
        emit(ContributionReceived{ member: sender(), roundNum: msg.roundNum, amount: self.contribution }.toCell());

        // F-03: refund any overpayment beyond contribution + gas reserve.
        let excess: Int = context().value - self.contribution - GAS_FORWARD_FEE;
        if (excess > GAS_FORWARD_FEE) {
            send(SendParameters{
                to: sender(),
                value: excess,
                mode: SendIgnoreErrors | SendPayGasSeparately,
                bounce: false
            });
        }
    }

    receive(msg: ExecuteRound) {
        require(self.status == 1, "not active");
        let k: Int = self.currentRound;
        let eligibleAt: Int = self.startTimestamp + (k - 1) * self.roundIntervalSec;
        require(now() >= eligibleAt, "too early");

        let winnerOpt: Address? = self.members.get(k);
        require(winnerOpt != null, "no winner slot");
        let winner: Address = winnerOpt!!;

        // count paid vs defaulted
        let paidCount: Int = 0;
        let i: Int = 1;
        while (i <= self.memberCount) {
            let key: Int = k * 64 + i;
            let paid: Bool? = self.contributions.get(key);
            if (paid != null) {
                paidCount = paidCount + 1;
            } else {
                let mOpt: Address? = self.members.get(i);
                if (mOpt != null) {
                    emit(DefaultDetected{ member: mOpt!!, roundNum: k }.toCell());
                }
            }
            i = i + 1;
        }

        // F-08: when not all members have contributed, enforce a grace window
        // before defaulters can be punished. If everyone paid, no grace needed.
        if (paidCount < self.memberCount) {
            require(now() >= eligibleAt + GRACE_WINDOW_SEC, "grace window");
        }

        // F-06: refuse to execute a round with zero contributions. The slot
        // would otherwise be silently consumed.
        require(paidCount > 0 || self.defaultPolicy == 1, "no contributions");

        // Handle Cancel policy: if any defaulter, cancel the kye
        if (self.defaultPolicy == 1 && paidCount < self.memberCount) {
            self.queueRefunds();
            self.status = 3;
            self.cancelledAt = now();
            emit(KyeCancelled{ reason: 1 }.toCell());
            return;
        }

        // Compute pool based on policy
        // ProRata (0): pool = paidCount * contribution
        // OrganizerCover (2): pool = memberCount * contribution; shortfall tracked.
        let pool: Int = paidCount * self.contribution;
        if (self.defaultPolicy == 2 && paidCount < self.memberCount) {
            let shortfall: Int = (self.memberCount - paidCount) * self.contribution;
            pool = self.memberCount * self.contribution;
            self.pendingShortfall = self.pendingShortfall + shortfall;
        }

        let platformFee: Int = (pool * 50) / 10000;
        let organizerFee: Int = (pool * (self.feeRateBps - 50)) / 10000;
        let netPool: Int = pool - platformFee - organizerFee;

        // adjustment(k) per GSD 2.4
        let adjustmentBps: Int = 0;
        if (self.memberCount > 1) {
            adjustmentBps = (2 * k - self.memberCount - 1) * self.timeAdjustmentMaxBps / (self.memberCount - 1);
        }
        let intendedPayout: Int = netPool * (10000 + adjustmentBps) / 10000;
        if (intendedPayout < 0) {
            intendedPayout = 0;
        }

        // F-01: cap payout at available balance to preserve solvency.
        let totalIntendedOut: Int = platformFee + organizerFee + intendedPayout;
        let available: Int = myBalance() - SELF_KEEP;
        if (available < 0) {
            available = 0;
        }
        let payout: Int = intendedPayout;
        let deficit: Int = 0;
        if (totalIntendedOut > available) {
            // Pay fees in full only if affordable, then cap payout at remainder.
            let feesTotal: Int = platformFee + organizerFee;
            if (feesTotal >= available) {
                payout = 0;
            } else {
                payout = available - feesTotal;
            }
            deficit = intendedPayout - payout;
            emit(PayoutCapped{ roundNum: k, intended: intendedPayout, actual: payout, deficit: deficit }.toCell());
            if (self.defaultPolicy == 2) {
                emit(OrganizerCoverShortfall{ organizer: self.organizer, roundNum: k, deficit: deficit }.toCell());
            }
        }

        if (platformFee > 0) {
            send(SendParameters{
                to: self.platformTreasury,
                value: platformFee,
                mode: SendPayGasSeparately,
                bounce: false
            });
        }
        if (organizerFee > 0) {
            send(SendParameters{
                to: self.organizer,
                value: organizerFee,
                mode: SendPayGasSeparately,
                bounce: false
            });
        }
        if (payout > 0) {
            send(SendParameters{
                to: winner,
                value: payout,
                mode: SendPayGasSeparately,
                bounce: false
            });
        }

        emit(FeeDistributed{ platform: platformFee, organizer: organizerFee }.toCell());
        emit(PayoutSent{ winner: winner, amount: payout }.toCell());
        emit(RoundExecuted{ roundNum: k, winner: winner, payout: payout }.toCell());

        self.currentRound = k + 1;
        if (self.currentRound > self.memberCount) {
            self.status = 2;
            emit(KyeCompleted{ totalRounds: self.memberCount }.toCell());
        }
    }

    // F-02: pull-refund pattern. Tally each member's refund into `refunds`
    // in a single transaction (O(N^2) state reads but no sends), members then
    // claim via `ClaimRefund`.
    fun queueRefunds() {
        let i: Int = 1;
        while (i <= self.memberCount) {
            let mOpt: Address? = self.members.get(i);
            if (mOpt != null) {
                let m: Address = mOpt!!;
                let total: Int = 0;
                let r: Int = 1;
                while (r <= self.memberCount) {
                    let key: Int = r * 64 + i;
                    let paid: Bool? = self.contributions.get(key);
                    if (paid != null) {
                        total = total + self.contribution;
                        self.contributions.set(key, null);
                    }
                    r = r + 1;
                }
                if (total > 0) {
                    let existing: Int? = self.refunds.get(m);
                    let newTotal: Int = total;
                    if (existing != null) {
                        newTotal = (existing!!) + total;
                    }
                    self.refunds.set(m, newTotal);
                    emit(RefundQueued{ member: m, amount: newTotal }.toCell());
                }
            }
            i = i + 1;
        }
    }

    receive(msg: EmergencyCancel) {
        require(sender() == self.organizer, "only organizer");
        require(self.status == 0 || self.status == 1, "cannot cancel");
        self.queueRefunds();
        self.status = 3;
        self.cancelledAt = now();
        emit(KyeCancelled{ reason: msg.reason }.toCell());
    }

    receive(msg: ClaimRefund) {
        require(self.status == 3, "not cancelled");
        let s: Address = sender();
        let pendingOpt: Int? = self.refunds.get(s);
        require(pendingOpt != null, "no refund");
        let pending: Int = pendingOpt!!;
        require(pending > 0, "no refund");
        self.refunds.set(s, null);
        send(SendParameters{
            to: s,
            value: pending,
            mode: SendPayGasSeparately,
            bounce: false
        });
        emit(RefundClaimed{ member: s, amount: pending }.toCell());
    }

    // F-05: OrganizerCover top-up. Anyone can top up but only the organizer is
    // expected to in practice. Reduces `pendingShortfall` for transparency.
    receive(msg: TopUp) {
        let amount: Int = context().value;
        if (self.pendingShortfall > 0) {
            if (amount >= self.pendingShortfall) {
                self.pendingShortfall = 0;
            } else {
                self.pendingShortfall = self.pendingShortfall - amount;
            }
        }
        emit(ToppedUp{ from: sender(), amount: amount }.toCell());
    }

    // --- Getters ---
    get fun organizerAddr(): Address { return self.organizer; }
    get fun memberCountGet(): Int { return self.memberCount; }
    get fun statusGet(): Int { return self.status; }
    get fun currentRoundGet(): Int { return self.currentRound; }
    get fun joinedCountGet(): Int { return self.joinedCount; }
    get fun memberAt(idx: Int): Address? { return self.members.get(idx); }
    get fun contributionAmt(): Int { return self.contribution; }
    get fun feeRate(): Int { return self.feeRateBps; }
    get fun alphaMax(): Int { return self.timeAdjustmentMaxBps; }
    get fun policy(): Int { return self.defaultPolicy; }
    get fun startTs(): Int { return self.startTimestamp; }
    get fun roundInterval(): Int { return self.roundIntervalSec; }
    get fun hasContributed(round: Int, order: Int): Bool {
        let key: Int = round * 64 + order;
        let v: Bool? = self.contributions.get(key);
        return v != null;
    }
    get fun refundOf(member: Address): Int {
        let v: Int? = self.refunds.get(member);
        if (v == null) { return 0; }
        return v!!;
    }
    get fun shortfall(): Int { return self.pendingShortfall; }
    get fun cancelledAtGet(): Int { return self.cancelledAt; }
}
