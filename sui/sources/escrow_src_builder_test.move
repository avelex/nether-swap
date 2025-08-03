#[test_only]
module htlc::escrow_src_builder_test {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::sui::SUI;
    use htlc::escrow_src::{Self, EscrowSrc};
    use htlc::escrow_src_builder::{Self, EscrowSrcBuilder};
    use htlc::capabilities::{Self, AdminCap, ResolverCap};

    // Test users
    const USER: address = @0x1;
    const TAKER: address = @0x3;
    const THIRD_PARTY: address = @0x4;

    // Test constants
    const DEPOSIT_AMOUNT: u64 = 1000_000_000; // 1 SUI
    const SAFETY_DEPOSIT_AMOUNT: u64 = 100_000_000; // 0.1 SUI
    const SECRET: vector<u8> = b"test_secret_123";

    // Time constants (in milliseconds)
    const HOUR: u64 = 3_600_000;
    const INITIAL_TIME: u64 = 1000000;

    // Helper function to create hash lock
    fun create_hash_lock(): vector<u8> {
        let secret_copy = SECRET;
        sui::hash::keccak256(&secret_copy)
    }

    // Helper function to setup scenario with clock
    fun setup_test(): (Scenario, Clock) {
        let mut scenario = ts::begin(USER);
        let mut clock = clock::create_for_testing(scenario.ctx());
        clock::set_for_testing(&mut clock, INITIAL_TIME);
        (scenario, clock)
    }

    // Helper function to mint coins for testing
    fun mint_coins<T>(scenario: &mut Scenario, amount: u64, recipient: address) {
        ts::next_tx(scenario, recipient);
        let coin = coin::mint_for_testing<T>(amount, scenario.ctx());
        transfer::public_transfer(coin, recipient);
    }

    #[test]
    public fun test_escrow_src_builder_happy_path() {
        let (mut scenario, mut clock) = setup_test();
        let hash_lock = create_hash_lock();

        // Setup: mint coins for user and 
        mint_coins<SUI>(&mut scenario, DEPOSIT_AMOUNT, USER);
        mint_coins<SUI>(&mut scenario, SAFETY_DEPOSIT_AMOUNT, TAKER);

        // Setup capabilities first
        ts::next_tx(&mut scenario, USER);
        capabilities::init_for_testing(scenario.ctx());
        
        ts::next_tx(&mut scenario, USER);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, TAKER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };

        // Step 1: User creates EscrowSrcBuilder
        ts::next_tx(&mut scenario, USER);
        {
            let user_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            escrow_src_builder::create_src_builder(
                user_deposit,
                TAKER,
                hash_lock,
                &clock,
                scenario.ctx()
            );
        };

        // Step 2:  completes escrow
        ts::next_tx(&mut scenario, TAKER);
        {
            let builder = ts::take_shared<EscrowSrcBuilder<SUI>>(&scenario);
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            
            escrow_src_builder::complete_escrow(
                builder,
                safety_deposit,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, resolver_cap);
        };

        // Advance time to allow withdrawal
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);

        // Step 3: TAKER withdraws with correct secret
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            
            escrow_src::withdraw(
                escrow,
                SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, resolver_cap);
        };

        // Verify  received tokens and safety deposit (src escrow sends both to caller)
        ts::next_tx(&mut scenario, TAKER);
        {
            //  should have received both tokens and safety deposit
            let mut total_received = 0;
            
            // Take first coin (could be either deposit or safety deposit)
            let coin1 = ts::take_from_sender<Coin<SUI>>(&scenario);
            total_received = total_received + coin::value(&coin1);
            
            // Take second coin
            let coin2 = ts::take_from_sender<Coin<SUI>>(&scenario);
            total_received = total_received + coin::value(&coin2);
            
            // Should equal deposit + safety deposit
            assert!(total_received == DEPOSIT_AMOUNT + SAFETY_DEPOSIT_AMOUNT, 0);
            
            ts::return_to_sender(&scenario, coin1);
            ts::return_to_sender(&scenario, coin2);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    public fun test_builder_timeout_refund() {
        let (mut scenario, mut clock) = setup_test();
        let hash_lock = create_hash_lock();

        // Setup: mint coins for user
        mint_coins<SUI>(&mut scenario, DEPOSIT_AMOUNT, USER);

        // Setup capabilities
        ts::next_tx(&mut scenario, USER);
        capabilities::init_for_testing(scenario.ctx());
        
        ts::next_tx(&mut scenario, USER);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, USER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };

        // Step 1: User creates EscrowSrcBuilder
        ts::next_tx(&mut scenario, USER);
        {
            let user_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            escrow_src_builder::create_src_builder(
                user_deposit,
                TAKER,
                hash_lock,
                &clock,
                scenario.ctx()
            );
        };

        // Advance time past builder timeout
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);

        // Step 2: User refunds after timeout
        ts::next_tx(&mut scenario, USER);
        {
            let builder = ts::take_shared<EscrowSrcBuilder<SUI>>(&scenario);
            
            escrow_src_builder::refund_expired(
                builder,
                &clock,
                scenario.ctx()
            );
        };

        // Verify user received funds back
        ts::next_tx(&mut scenario, USER);
        {
            let refunded_tokens = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&refunded_tokens) == DEPOSIT_AMOUNT, 0);
            ts::return_to_sender(&scenario, refunded_tokens);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = htlc::errors::EBuilderExpired, location = htlc::escrow_src_builder)]
    public fun test_complete_escrow_after_timeout() {
        let (mut scenario, mut clock) = setup_test();
        let hash_lock = create_hash_lock();

        // Setup: mint coins for user and TAKER
        mint_coins<SUI>(&mut scenario, DEPOSIT_AMOUNT, USER);
        mint_coins<SUI>(&mut scenario, SAFETY_DEPOSIT_AMOUNT, TAKER);

        // Setup capabilities
        ts::next_tx(&mut scenario, USER);
        capabilities::init_for_testing(scenario.ctx());
        
        ts::next_tx(&mut scenario, USER);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, USER, scenario.ctx());
            capabilities::grant_resolver_cap(&admin_cap, TAKER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };

        // Step 1: User creates EscrowSrcBuilder
        ts::next_tx(&mut scenario, USER);
        {
            let user_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            escrow_src_builder::create_src_builder(
                user_deposit,
                TAKER,
                hash_lock,
                &clock,
                scenario.ctx()
            );
        };

        // Advance time past builder timeout
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);

        // Setup capabilities
        ts::next_tx(&mut scenario, USER);
        capabilities::init_for_testing(scenario.ctx());
        
        ts::next_tx(&mut scenario, USER);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, TAKER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };

        // Step 2: Try to complete escrow after timeout - should fail
        ts::next_tx(&mut scenario, TAKER);
        {
            let builder = ts::take_shared<EscrowSrcBuilder<SUI>>(&scenario);
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            
            escrow_src_builder::complete_escrow(
                builder,
                safety_deposit,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, resolver_cap);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = htlc::errors::EBuilderNotExpired, location = htlc::escrow_src_builder)]
    public fun test_refund_before_timeout() {
        let (mut scenario, clock) = setup_test();
        let hash_lock = create_hash_lock();

        // Setup: mint coins for user
        mint_coins<SUI>(&mut scenario, DEPOSIT_AMOUNT, USER);

        // Setup capabilities
        ts::next_tx(&mut scenario, USER);
        capabilities::init_for_testing(scenario.ctx());
        
        ts::next_tx(&mut scenario, USER);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, USER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };

        // Step 1: User creates EscrowSrcBuilder
        ts::next_tx(&mut scenario, USER);
        {
            let user_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            escrow_src_builder::create_src_builder(
                user_deposit,
                TAKER,
                hash_lock,
                &clock,
                scenario.ctx()
            );
        };

        // Step 2: Try to refund before timeout - should fail
        ts::next_tx(&mut scenario, USER);
        {
            let builder = ts::take_shared<EscrowSrcBuilder<SUI>>(&scenario);
            
            escrow_src_builder::refund_expired(
                builder,
                &clock,
                scenario.ctx()
            );
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = htlc::errors::EOnlyMaker, location = htlc::escrow_src_builder)]
    public fun test_unauthorized_refund() {
        let (mut scenario, mut clock) = setup_test();
        let hash_lock = create_hash_lock();

        // Setup: mint coins for user
        mint_coins<SUI>(&mut scenario, DEPOSIT_AMOUNT, USER);

        // Setup capabilities
        ts::next_tx(&mut scenario, USER);
        capabilities::init_for_testing(scenario.ctx());
        
        ts::next_tx(&mut scenario, USER);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, USER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };

        // Step 1: User creates EscrowSrcBuilder
        ts::next_tx(&mut scenario, USER);
        {
            let user_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            escrow_src_builder::create_src_builder(
                user_deposit,
                TAKER,
                hash_lock,
                &clock,
                scenario.ctx()
            );
        };

        // Advance time past builder timeout
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);

        // Step 2: Try to refund as third party - should fail
        ts::next_tx(&mut scenario, THIRD_PARTY);
        {
            let builder = ts::take_shared<EscrowSrcBuilder<SUI>>(&scenario);
            
            escrow_src_builder::refund_expired(
                builder,
                &clock,
                scenario.ctx()
            );
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    public fun test_builder_view_functions() {
        let (mut scenario, clock) = setup_test();
        let hash_lock = create_hash_lock();

        // Setup: mint coins for user
        mint_coins<SUI>(&mut scenario, DEPOSIT_AMOUNT, USER);

        // Setup capabilities
        ts::next_tx(&mut scenario, USER);
        capabilities::init_for_testing(scenario.ctx());
        
        ts::next_tx(&mut scenario, USER);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, USER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };

        // Step 1: User creates EscrowSrcBuilder
        ts::next_tx(&mut scenario, USER);
        {
            let user_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            escrow_src_builder::create_src_builder(
                user_deposit,
                TAKER,
                hash_lock,
                &clock,
                scenario.ctx()
            );
        };

        // Step 2: Test view functions
        ts::next_tx(&mut scenario, USER);
        {
            let builder = ts::take_shared<EscrowSrcBuilder<SUI>>(&scenario);
            
            let (sender, recipient, balance, hash, created_at, timeout) = 
                escrow_src_builder::get_builder_info(&builder);
            
            assert!(sender == USER, 0);
            assert!(recipient == TAKER, 1);
            assert!(balance == DEPOSIT_AMOUNT, 2);
            assert!(hash == hash_lock, 3);
            assert!(created_at == INITIAL_TIME, 4);
            assert!(timeout == INITIAL_TIME + HOUR, 5);
            
            assert!(!escrow_src_builder::is_expired(&builder, &clock), 6);
            assert!(escrow_src_builder::can_complete(&builder, &clock), 7);
            
            ts::return_shared(builder);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    public fun test_zero_amount_builder() {
        let (mut scenario, mut clock) = setup_test();
        let hash_lock = create_hash_lock();

        // Setup: mint coins for TAKER
        mint_coins<SUI>(&mut scenario, SAFETY_DEPOSIT_AMOUNT, TAKER);

        // Setup capabilities first
        ts::next_tx(&mut scenario, USER);
        capabilities::init_for_testing(scenario.ctx());
        
        ts::next_tx(&mut scenario, USER);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, USER, scenario.ctx());
            capabilities::grant_resolver_cap(&admin_cap, TAKER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };

        // Step 1: User creates EscrowSrcBuilder with zero amount
        ts::next_tx(&mut scenario, USER);
        {
            let zero_deposit = coin::zero<SUI>(scenario.ctx());
            escrow_src_builder::create_src_builder(
                zero_deposit,
                TAKER,
                hash_lock,
                &clock,
                scenario.ctx()
            );
        };

        // Step 2: TAKER completes escrow
        ts::next_tx(&mut scenario, TAKER);
        {
            let builder = ts::take_shared<EscrowSrcBuilder<SUI>>(&scenario);
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            
            escrow_src_builder::complete_escrow(
                builder,
                safety_deposit,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, resolver_cap);
        };

        // Advance time to allow withdrawal
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);

        // Step 3: TAKER withdraws
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            
            escrow_src::withdraw(
                escrow,
                SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, resolver_cap);
        };

        // Verify TAKER received safety deposit (zero tokens + safety deposit)
        ts::next_tx(&mut scenario, TAKER);
        {
            // Should have received zero tokens coin and safety deposit coin
            let coin1 = ts::take_from_sender<Coin<SUI>>(&scenario);
            let coin2 = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let val1 = coin::value(&coin1);
            let val2 = coin::value(&coin2);
            
            // One should be zero, one should be safety deposit amount
            if (val1 == 0) {
                assert!(val2 == SAFETY_DEPOSIT_AMOUNT, 1);
                coin::destroy_zero(coin1);
                ts::return_to_sender(&scenario, coin2);
            } else {
                assert!(val1 == SAFETY_DEPOSIT_AMOUNT && val2 == 0, 2);
                coin::destroy_zero(coin2);
                ts::return_to_sender(&scenario, coin1);
            };
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}