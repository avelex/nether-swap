module htlc::escrow_src_builder {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::sui::SUI;
    use sui::event;
    use htlc::escrow_src::{Self};
    use htlc::capabilities::{ResolverCap};
    use htlc::errors;

    const HOUR: u64 = 3_600_000;
    const BUILDER_TIMEOUT_DURATION: u64 = HOUR;

    // Intermediate builder for source escrows - handles 2-step creation safely
    public struct EscrowSrcBuilder<phantom T> has key {
        id: object::UID,
        maker: address,
        taker: address,
        balance: Balance<T>,
        hash_lock: vector<u8>,
        created_at: u64,
        timeout: u64,
    }

    /// Event emitted when builder is created
    public struct BuilderCreated has copy, drop {
        builder_id: object::ID,
        maker: address,
        taker: address,
        amount: u64,
        hash_lock: vector<u8>,
        timeout: u64,
    }

    /// Event emitted when builder times out and funds are refunded
    public struct BuilderRefunded has copy, drop {
        builder_id: object::ID,
        maker: address,
        amount: u64,
    }

    /// Event emitted when builder is used to create escrow
    public struct BuilderUsed has copy, drop {
        builder_id: object::ID,
        taker: address,
        escrow_id: object::ID,
    }

    /// Step 1: User creates EscrowSrcBuilder with their deposit
    public entry fun create_src_builder<T>(
        user_deposit: Coin<T>,
        taker: address,
        hash_lock: vector<u8>,
        clock: &Clock,
        ctx: &mut tx_context::TxContext
    ) {
        let maker = ctx.sender();
        let current_time = clock::timestamp_ms(clock);
        
        let builder = EscrowSrcBuilder<T> {
            id: object::new(ctx),
            maker,
            taker,
            balance: coin::into_balance(user_deposit),
            hash_lock,
            created_at: current_time,
            timeout: current_time + BUILDER_TIMEOUT_DURATION,
        };

        // Emit creation event
        event::emit(BuilderCreated {
            builder_id: object::uid_to_inner(&builder.id),
            maker,
            taker,
            amount: balance::value(&builder.balance),
            hash_lock,
            timeout: builder.timeout,
        });
        
        // Share the builder object publicly
        transfer::share_object(builder);
    }

    /// Step 2: Taker adds safety deposit and creates Escrow
    public entry fun complete_escrow<T>(
        builder: EscrowSrcBuilder<T>,
        safety_deposit: Coin<SUI>,
        resolver_cap: &ResolverCap,
        clock: &Clock,
        ctx: &mut tx_context::TxContext
    ) {
        let sender = ctx.sender();
        let current_time = clock::timestamp_ms(clock);
        
        // Verify builder hasn't expired
        assert!(sender == builder.taker, errors::only_taker());
        assert!(current_time <= builder.timeout, errors::builder_expired());
        
        // Extract builder data
        let EscrowSrcBuilder {
            id: builder_id,
            maker,
            taker: taker,
            balance,
            hash_lock,
            created_at: _,
            timeout: _,
        } = builder;

        // Create the escrow using the new escrow_src module
        let escrow = escrow_src::new_escrow_src<T>(
            balance,
            coin::into_balance(safety_deposit),
            maker,   
            taker,
            hash_lock,
            resolver_cap,
            clock,
            ctx
        );

        let escrow_id = object::uid_to_inner(escrow_src::get_escrow_id(&escrow));

        // Emit builder used event
        event::emit(BuilderUsed {
            builder_id: object::uid_to_inner(&builder_id),
            taker,
            escrow_id,
        });

        // Share the escrow
        escrow_src::share_escrow_src(escrow);
        
        // Delete the builder
        object::delete(builder_id);
    }

    /// Step 3: Refund user if timeout expires
    public entry fun refund_expired<T>(
        builder: EscrowSrcBuilder<T>,
        clock: &Clock,
        ctx: &mut tx_context::TxContext
    ) {
        let sender = ctx.sender();
        let current_time = clock::timestamp_ms(clock);
        
        // Verify builder has expired
        assert!(current_time > builder.timeout, errors::builder_not_expired());
        
        // Only original sender can refund
        assert!(sender == builder.maker, errors::only_maker());
        
        // Extract builder data
        let EscrowSrcBuilder {
            id: builder_id,
            maker: maker,
            taker: _,
            balance,
            hash_lock: _,
            created_at: _,
            timeout: _,
        } = builder;

        // Return funds to original sender
        let refund_amount = balance::value(&balance);
        let refunded_tokens = coin::from_balance(balance, ctx);
        transfer::public_transfer(refunded_tokens, maker);

        // Emit refund event
        event::emit(BuilderRefunded {
            builder_id: object::uid_to_inner(&builder_id),
            maker: maker,
            amount: refund_amount,
        });

        // Delete the builder
        object::delete(builder_id);
    }

    // === View Functions ===

    /// Get builder info
    public fun get_builder_info<T>(builder: &EscrowSrcBuilder<T>): (
        address,    // sender
        address,    // taker 
        u64,        // balance
        vector<u8>, // hash_lock
        u64,        // created_at
        u64         // timeout
    ) {
        (
            builder.maker,
            builder.taker,
            balance::value(&builder.balance),
            builder.hash_lock,
            builder.created_at,
            builder.timeout
        )
    }

    /// Check if builder has expired
    public fun is_expired<T>(builder: &EscrowSrcBuilder<T>, clock: &Clock): bool {
        let current_time = clock::timestamp_ms(clock);
        current_time > builder.timeout
    }

    /// Check if builder can still be used
    public fun can_complete<T>(builder: &EscrowSrcBuilder<T>, clock: &Clock): bool {
        let current_time = clock::timestamp_ms(clock);
        current_time <= builder.timeout
    }
}