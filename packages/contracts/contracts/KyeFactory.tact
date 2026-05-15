// KyeFactory — creates KyeContract instances.
// Computes child stateInit via initOf and deploys with `deploy()`.

import "@stdlib/deploy";
import "./KyeContract.tact";

message CreateKye {
    organizer: Address;
    memberCount: Int as uint8;
    contribution: Int as coins;
    roundIntervalSec: Int as uint32;
    feeRateBps: Int as uint16;
    timeAdjustmentMaxBps: Int as uint16;
    defaultPolicy: Int as uint8;
    salt: Int as uint64;
}

message KyeCreatedEvt { kyeAddress: Address; organizer: Address; memberCount: Int as uint8; contribution: Int as coins; salt: Int as uint64 }

// Round-interval bounds. Lower bound (60 s) lets us test full cycles in
// minutes on testnet; upper bound (90 days) blocks accidental absurd values.
// The exact list of *exposed* interval presets lives in the application layer
// (backend ALLOWED_INTERVALS + TMA selector), so mainnet can drop the 1-min
// option without a contract redeploy.
const MIN_ROUND_INTERVAL_SEC: Int = 60;
const MAX_ROUND_INTERVAL_SEC: Int = 7776000; // 90 days
// First-round + storage rent reserve forwarded to child contract.
const CHILD_INITIAL_TON: Int = 150000000; // 0.15 TON

contract KyeFactory with Deployable {
    owner: Address;
    platformTreasury: Address;
    deployedCount: Int as uint32;
    nextSalt: Int as uint64;

    init(owner: Address, platformTreasury: Address) {
        self.owner = owner;
        self.platformTreasury = platformTreasury;
        self.deployedCount = 0;
        self.nextSalt = 1;
    }

    receive(msg: CreateKye) {
        // Prevent fee redirection: the caller must be the declared organizer.
        require(msg.organizer == sender(), "organizer must be sender");
        require(msg.feeRateBps >= 200 && msg.feeRateBps <= 10000, "fee rate out of range");
        require(msg.timeAdjustmentMaxBps <= 10000, "alpha out of range");
        require(msg.memberCount >= 2 && msg.memberCount <= 30, "N out of range");
        require(msg.contribution > 0, "bad contribution");
        require(
            msg.roundIntervalSec >= MIN_ROUND_INTERVAL_SEC
                && msg.roundIntervalSec <= MAX_ROUND_INTERVAL_SEC,
            "bad interval"
        );
        require(msg.defaultPolicy <= 2, "bad policy");
        require(context().value >= CHILD_INITIAL_TON, "insufficient deploy value");

        // F-13: if caller passes salt=0, assign a monotonic salt so identical
        // params never collide. Otherwise honor the caller's salt.
        let effectiveSalt: Int = msg.salt;
        if (effectiveSalt == 0) {
            effectiveSalt = self.nextSalt;
        }
        self.nextSalt = self.nextSalt + 1;

        let kyeInit: KyeInit = KyeInit{
            organizer: msg.organizer,
            memberCount: msg.memberCount,
            contribution: msg.contribution,
            roundIntervalSec: msg.roundIntervalSec,
            feeRateBps: msg.feeRateBps,
            timeAdjustmentMaxBps: msg.timeAdjustmentMaxBps,
            defaultPolicy: msg.defaultPolicy,
            platformTreasury: self.platformTreasury,
            salt: effectiveSalt
        };
        let si: StateInit = initOf KyeContract(kyeInit);
        let childAddr: Address = contractAddress(si);

        deploy(DeployParameters{
            init: si,
            mode: SendPayGasSeparately,
            value: CHILD_INITIAL_TON,
            bounce: false,
            body: Deploy{ queryId: effectiveSalt }.toCell()
        });

        self.deployedCount = self.deployedCount + 1;
        emit(KyeCreatedEvt{
            kyeAddress: childAddr,
            organizer: msg.organizer,
            memberCount: msg.memberCount,
            contribution: msg.contribution,
            salt: effectiveSalt
        }.toCell());
    }

    get fun ownerAddr(): Address { return self.owner; }
    get fun treasury(): Address { return self.platformTreasury; }
    get fun count(): Int { return self.deployedCount; }

    get fun kyeAddressOf(
        organizer: Address,
        memberCount: Int,
        contribution: Int,
        roundIntervalSec: Int,
        feeRateBps: Int,
        timeAdjustmentMaxBps: Int,
        defaultPolicy: Int,
        salt: Int
    ): Address {
        let kyeInit: KyeInit = KyeInit{
            organizer: organizer,
            memberCount: memberCount,
            contribution: contribution,
            roundIntervalSec: roundIntervalSec,
            feeRateBps: feeRateBps,
            timeAdjustmentMaxBps: timeAdjustmentMaxBps,
            defaultPolicy: defaultPolicy,
            platformTreasury: self.platformTreasury,
            salt: salt
        };
        return contractAddress(initOf KyeContract(kyeInit));
    }

    get fun nextSaltGet(): Int { return self.nextSalt; }
}
