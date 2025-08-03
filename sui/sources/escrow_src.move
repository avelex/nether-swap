module htlc::escrow_src {
    use sui::coin::{Self};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::sui::SUI;
    use sui::event;
    use sui::hash;
    use htlc::capabilities::{ResolverCap};
    use htlc::errors;

    const HOUR: u64 = 3_600_000;
    const SRC_WITHDRAWAL_START_DURATION: u64 = 15_000; // 15 sec
    const SRC_PUBLIC_WITHDRAWAL_DURATION: u64 = HOUR * 2;
    const SRC_CANCELLATION_DURATION: u64 = HOUR * 3;
    const SRC_PUBLIC_CANCELLATION_DURATION: u64 = HOUR * 4;

    // Source Escrow contract structure
    public struct EscrowSrc<phantom T> has key {
        id: object::UID,

        // Contract participants
        maker: address,   // User who created the escrow
        taker: address,   // Resolver who can withdraw

        // Token balance locked in contract
        balance: Balance<T>,

        // Safety deposit for resolver incentives (must be native SUI)
        safety_deposit: Balance<SUI>,

        // Hash of the secret
        hash_lock: vector<u8>,

        // Timelock parameters
        withdrawal_time: u64,
        public_withdrawal_time: u64,
        cancellation_time: u64,
        public_cancellation_time: u64,

        // Creation timestamp
        created_at: u64,
    }

    /// Event emitted when contract is created
    public struct EscrowCreated has copy, drop {
        escrow_id: object::ID,
        maker: address,
        taker: address,
        amount: u64,
        hash_lock: vector<u8>,
        withdrawal_time: u64,
    }

    /// Event emitted when tokens are withdrawn
    public struct EscrowWithdrawal has copy, drop {
        escrow_id: object::ID,
        withdrawer: address,
        target: address,
        secret: vector<u8>,
        amount: u64,
    }

    /// Event emitted when contract is cancelled
    public struct EscrowCancelled has copy, drop {
        escrow_id: object::ID,
        canceller: address,
        amount: u64,
    }

    /// Event emitted during public withdrawal
    public struct PublicWithdrawal has copy, drop {
        escrow_id: object::ID,
        withdrawer: address,
        secret: vector<u8>,
        amount: u64,
    }

    /// Create source escrow directly (for internal use)
    public fun new_escrow_src<T>(
        escrow_balance: Balance<T>,
        safety_balance: Balance<SUI>,
        maker: address,
        taker: address,
        hash_lock: vector<u8>,
        _: &ResolverCap,
        clock: &Clock,
        ctx: &mut tx_context::TxContext
    ): EscrowSrc<T> {
        let current_time = clock::timestamp_ms(clock);

        let escrow = EscrowSrc<T> {
            id: object::new(ctx),
            maker,
            taker,
            balance: escrow_balance,
            safety_deposit: safety_balance,
            hash_lock,
            withdrawal_time: current_time + SRC_WITHDRAWAL_START_DURATION,
            public_withdrawal_time: current_time + SRC_PUBLIC_WITHDRAWAL_DURATION,
            cancellation_time: current_time + SRC_CANCELLATION_DURATION,
            public_cancellation_time: current_time + SRC_PUBLIC_CANCELLATION_DURATION,
            created_at: current_time,
        };

        // Emit creation event
        event::emit(EscrowCreated {
            escrow_id: object::uid_to_inner(&escrow.id),
            maker,
            taker,
            amount: balance::value(&escrow.balance),
            hash_lock,
            withdrawal_time: escrow.withdrawal_time,
        });

        escrow
    }

    /// Share escrow object
    public fun share_escrow_src<T>(escrow: EscrowSrc<T>) {
        transfer::share_object(escrow);
    }

    /// Get escrow ID for external use
    public fun get_escrow_id<T>(escrow: &EscrowSrc<T>): &object::UID {
        &escrow.id
    }

    /// Withdraw tokens with secret (private withdrawal - only taker)
    public fun withdraw<T>(
        escrow: EscrowSrc<T>,
        secret: vector<u8>,
        resolver_cap: &ResolverCap,
        clock: &Clock,
        ctx: &mut tx_context::TxContext
    ) {
        withdraw_to(
            escrow, 
            secret, 
            ctx.sender(), 
            resolver_cap,
            clock, 
            ctx,
        );
    }

    /// Withdraw tokens to specific address (private withdrawal - only taker)
    #[allow(lint(self_transfer))]
    public fun withdraw_to<T>(
        escrow: EscrowSrc<T>,
        secret: vector<u8>,
        target: address,
        _: &ResolverCap,
        clock: &Clock,
        ctx: &mut tx_context::TxContext
    ) {
        let sender = ctx.sender();
        let current_time = clock::timestamp_ms(clock);
        
        // Only taker can withdraw privately
        assert!(sender == escrow.taker, errors::only_taker());
        
        // Verify we're in private withdrawal period
        assert!(current_time >= escrow.withdrawal_time, errors::contract_not_expired());
        assert!(current_time < escrow.cancellation_time, errors::contract_expired());

        // Verify secret matches hash
        let secret_hash = hash::keccak256(&secret);
        assert!(secret_hash == escrow.hash_lock, errors::invalid_secret());

        // Destructure the escrow object
        let EscrowSrc {
            id,
            maker: _,
            taker: _,
            balance,
            safety_deposit,
            hash_lock: _,
            withdrawal_time: _,
            public_withdrawal_time: _,
            cancellation_time: _,
            public_cancellation_time: _,
            created_at: _,
        } = escrow;

        // Extract tokens and safety deposit
        let withdrawn_amount = balance::value(&balance);
        let tokens = coin::from_balance(balance, ctx);
        let safety_deposit = coin::from_balance(safety_deposit, ctx);

        // Transfer tokens to target, safety deposit to caller (taker)
        transfer::public_transfer(tokens, target);
        transfer::public_transfer(safety_deposit, sender);

        // Emit withdrawal event
        event::emit(EscrowWithdrawal {
            escrow_id: object::uid_to_inner(&id),
            withdrawer: sender,
            target,
            secret,
            amount: withdrawn_amount,
        });

        // Delete the escrow object
        object::delete(id);
    }

    /// Public withdrawal (anyone with ResolverCap can call)
    #[allow(lint(self_transfer))]
    public fun public_withdraw<T>(
        escrow: EscrowSrc<T>,
        secret: vector<u8>,
        _: &ResolverCap,
        clock: &Clock,
        ctx: &mut tx_context::TxContext
    ) {
        let sender = ctx.sender();
        let current_time = clock::timestamp_ms(clock);

        // Verify we're in public withdrawal period
        assert!(current_time >= escrow.public_withdrawal_time, errors::contract_not_expired());
        assert!(current_time < escrow.cancellation_time, errors::contract_expired());

        // Verify secret matches hash
        let secret_hash = hash::keccak256(&secret);
        assert!(secret_hash == escrow.hash_lock, errors::invalid_secret());

        // Destructure the escrow object
        let EscrowSrc {
            id,
            maker: _,
            taker,
            balance,
            safety_deposit,
            hash_lock: _,
            withdrawal_time: _,
            public_withdrawal_time: _,
            cancellation_time: _,
            public_cancellation_time: _,
            created_at: _,
        } = escrow;

        // Extract tokens and safety deposit
        let withdrawn_amount = balance::value(&balance);
        let tokens = coin::from_balance(balance, ctx);
        let safety_deposit = coin::from_balance(safety_deposit, ctx);

        // Transfer tokens to taker, safety deposit to caller
        transfer::public_transfer(tokens, taker);
        transfer::public_transfer(safety_deposit, sender);

        // Emit public withdrawal event
        event::emit(PublicWithdrawal {
            escrow_id: object::uid_to_inner(&id),
            withdrawer: sender,
            secret,
            amount: withdrawn_amount,
        });

        // Delete the escrow object
        object::delete(id);
    }

    /// Cancel escrow (private cancellation - only taker)
    public fun cancel<T>(
        escrow: EscrowSrc<T>,
        _: &ResolverCap,
        clock: &Clock,
        ctx: &mut tx_context::TxContext
    ) {
        let sender = ctx.sender();
        let current_time = clock::timestamp_ms(clock);
        
        // Only taker can cancel privately
        assert!(sender == escrow.taker, errors::only_taker());

        // Verify we're in cancellation period
        assert!(current_time >= escrow.cancellation_time, errors::contract_not_expired());

        cancel_internal(escrow, ctx);
    }

    /// Public cancel (anyone with ResolverCap can call)
    public fun public_cancel<T>(
        escrow: EscrowSrc<T>,
        _: &ResolverCap,
        clock: &Clock,
        ctx: &mut tx_context::TxContext
    ) {
        let current_time = clock::timestamp_ms(clock);

        // Verify we're in public cancellation period
        assert!(current_time >= escrow.public_cancellation_time, errors::contract_not_expired());

        cancel_internal(escrow, ctx);
    }

    /// Internal cancel logic
    #[allow(lint(self_transfer))]
    fun cancel_internal<T>(
        escrow: EscrowSrc<T>,
        ctx: &mut tx_context::TxContext
    ) {
        let sender = ctx.sender();

        // Destructure the escrow object
        let EscrowSrc {
            id,
            maker,
            taker: _,
            balance,
            safety_deposit,
            hash_lock: _,
            withdrawal_time: _,
            public_withdrawal_time: _,
            cancellation_time: _,
            public_cancellation_time: _,
            created_at: _,
        } = escrow;

        // Return tokens to maker, safety deposit to caller
        let cancelled_amount = balance::value(&balance);
        let tokens = coin::from_balance(balance, ctx);
        let safety_deposit = coin::from_balance(safety_deposit, ctx);

        transfer::public_transfer(tokens, maker);
        transfer::public_transfer(safety_deposit, sender);

        // Emit cancellation event
        event::emit(EscrowCancelled {
            escrow_id: object::uid_to_inner(&id),
            canceller: sender,
            amount: cancelled_amount,
        });

        // Delete the escrow object
        object::delete(id);
    }

    // === View Functions ===

    /// Get contract details
    public fun get_escrow_info<T>(escrow: &EscrowSrc<T>): (
        address, // maker
        address, // taker
        u64,     // balance
        u64,     // safety_deposit
        vector<u8>, // hash_lock
        u64,     // withdrawal_time
        u64,     // public_withdrawal_time
        u64,     // cancellation_time
        u64,     // public_cancellation_time
        u64      // created_at
    ) {
        (
            escrow.maker,
            escrow.taker,
            balance::value(&escrow.balance),
            balance::value(&escrow.safety_deposit),
            escrow.hash_lock,
            escrow.withdrawal_time,
            escrow.public_withdrawal_time,
            escrow.cancellation_time,
            escrow.public_cancellation_time,
            escrow.created_at
        )
    }

    /// Check if contract can be withdrawn privately
    public fun can_withdraw<T>(escrow: &EscrowSrc<T>, clock: &Clock): bool {
        let current_time = clock::timestamp_ms(clock);
        current_time >= escrow.withdrawal_time && 
        current_time < escrow.cancellation_time
    }

    /// Check if contract can be withdrawn publicly
    public fun can_public_withdraw<T>(escrow: &EscrowSrc<T>, clock: &Clock): bool {
        let current_time = clock::timestamp_ms(clock);
        current_time >= escrow.public_withdrawal_time && 
        current_time < escrow.cancellation_time
    }

    /// Check if contract can be cancelled privately
    public fun can_cancel<T>(escrow: &EscrowSrc<T>, clock: &Clock): bool {
        let current_time = clock::timestamp_ms(clock);
        current_time >= escrow.cancellation_time
    }

    /// Check if contract can be cancelled publicly
    public fun can_public_cancel<T>(escrow: &EscrowSrc<T>, clock: &Clock): bool {
        let current_time = clock::timestamp_ms(clock);
        current_time >= escrow.public_cancellation_time
    }
}