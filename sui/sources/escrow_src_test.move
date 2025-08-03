#[test_only]
module htlc::escrow_src_test {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::sui::SUI;
    use htlc::escrow_src::{Self, EscrowSrc};
    use htlc::capabilities::{Self, ResolverCap};

    // Test users
    const MAKER: address = @0x1;
    const TAKER: address = @0x2;
    const THIRD_PARTY: address = @0x3;
    const ADMIN: address = @0x4;

    // Test constants
    const DEPOSIT_AMOUNT: u64 = 1000_000_000; // 1 SUI
    const SAFETY_DEPOSIT_AMOUNT: u64 = 100_000_000; // 0.1 SUI
    const SECRET: vector<u8> = b"test_secret_123";
    const WRONG_SECRET: vector<u8> = b"wrong_secret";

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
        let mut scenario = ts::begin(ADMIN);
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

    // Helper function to setup escrow with capabilities
    fun setup_escrow_with_caps(scenario: &mut Scenario, clock: &Clock): ResolverCap {
        // Setup capabilities
        ts::next_tx(scenario, ADMIN);
        capabilities::init_for_testing(scenario.ctx());
        
        // Grant resolver cap to TAKER
        ts::next_tx(scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<capabilities::AdminCap>(scenario);
            capabilities::grant_resolver_cap(&admin_cap, TAKER, scenario.ctx());
            ts::return_to_sender(scenario, admin_cap);
        };

        // Create escrow
        mint_coins<SUI>(scenario, DEPOSIT_AMOUNT, MAKER);
        mint_coins<SUI>(scenario, SAFETY_DEPOSIT_AMOUNT, TAKER);
        
        ts::next_tx(scenario, MAKER);
        let user_deposit = ts::take_from_sender<Coin<SUI>>(scenario);
        
        ts::next_tx(scenario, TAKER);
        let safety_deposit = ts::take_from_sender<Coin<SUI>>(scenario);
        let resolver_cap = ts::take_from_sender<ResolverCap>(scenario);
        
        let escrow = escrow_src::new_escrow_src<SUI>(
            coin::into_balance(user_deposit),
            coin::into_balance(safety_deposit),
            MAKER,
            TAKER,
            create_hash_lock(),
            &resolver_cap,
            clock,
            scenario.ctx()
        );
        
        escrow_src::share_escrow_src(escrow);
        ts::return_to_sender(scenario, resolver_cap);
        
        // Return resolver cap for tests
        ts::next_tx(scenario, TAKER);
        ts::take_from_sender<ResolverCap>(scenario)
    }

    #[test]
    public fun test_escrow_src_creation() {
        let (mut scenario, clock) = setup_test();

        ts::next_tx(&mut scenario, ADMIN);
        {
            capabilities::init_for_testing(scenario.ctx());
        };

        // Grant resolver cap to TAKER
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<capabilities::AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, TAKER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };
        
        mint_coins<SUI>(&mut scenario, DEPOSIT_AMOUNT, MAKER);
        mint_coins<SUI>(&mut scenario, SAFETY_DEPOSIT_AMOUNT, TAKER);
        
        ts::next_tx(&mut scenario, MAKER);
        let user_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
        
        ts::next_tx(&mut scenario, TAKER);
        let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
        let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
        
        let escrow = escrow_src::new_escrow_src<SUI>(
            coin::into_balance(user_deposit),
            coin::into_balance(safety_deposit),
            MAKER,
            TAKER,
            create_hash_lock(),
            &resolver_cap,
            &clock,
            scenario.ctx()
        );
        
        // Verify escrow details
        let (maker, taker, balance, safety_balance, hash_lock, 
             withdrawal_time, public_withdrawal_time, cancellation_time, 
             public_cancellation_time, created_at) = 
            escrow_src::get_escrow_info(&escrow);
        
        assert!(maker == MAKER, 0);
        assert!(taker == TAKER, 1);
        assert!(balance == DEPOSIT_AMOUNT, 2);
        assert!(safety_balance == SAFETY_DEPOSIT_AMOUNT, 3);
        assert!(hash_lock == create_hash_lock(), 4);
        assert!(withdrawal_time == INITIAL_TIME + 15_000, 5);
        assert!(public_withdrawal_time == INITIAL_TIME + HOUR * 2, 6);
        assert!(cancellation_time == INITIAL_TIME + HOUR * 3, 7);
        assert!(public_cancellation_time == INITIAL_TIME + HOUR * 4, 8);
        assert!(created_at == INITIAL_TIME, 10);
        
        // Share the escrow for cleanup
        escrow_src::share_escrow_src(escrow);
        clock::destroy_for_testing(clock);
        ts::return_to_sender(&scenario, resolver_cap);
        ts::end(scenario);
    }

    #[test]
    public fun test_private_withdraw_success() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time to withdrawal period
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);
        
        // TAKER withdraws with correct secret
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            
            escrow_src::withdraw(
                escrow,
                SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
        };
        
        // Verify TAKER (recipient) received both tokens and safety deposit
        ts::next_tx(&mut scenario, TAKER);
        {
            let coin1 = ts::take_from_sender<Coin<SUI>>(&scenario);
            let coin2 = ts::take_from_sender<Coin<SUI>>(&scenario);
            
            let total = coin::value(&coin1) + coin::value(&coin2);
            assert!(total == DEPOSIT_AMOUNT + SAFETY_DEPOSIT_AMOUNT, 0);
            
            ts::return_to_sender(&scenario, coin1);
            ts::return_to_sender(&scenario, coin2);
        };
        
        ts::return_to_sender(&scenario, resolver_cap);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    public fun test_withdraw_to_specific_address() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time to withdrawal period
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);
        
        // TAKER withdraws to THIRD_PARTY
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            
            escrow_src::withdraw_to(
                escrow,
                SECRET,
                THIRD_PARTY,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
        };
        
        // Verify THIRD_PARTY received tokens
        ts::next_tx(&mut scenario, THIRD_PARTY);
        {
            let tokens = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&tokens) == DEPOSIT_AMOUNT, 0);
            ts::return_to_sender(&scenario, tokens);
        };
        
        // Verify TAKER received safety deposit
        ts::next_tx(&mut scenario, TAKER);
        {
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&safety_deposit) == SAFETY_DEPOSIT_AMOUNT, 1);
            ts::return_to_sender(&scenario, safety_deposit);
        };
        
        ts::return_to_sender(&scenario, resolver_cap);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    public fun test_public_withdraw_with_resolver_cap() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time to public withdrawal period
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR * 2 + 100);
        
        // THIRD_PARTY withdraws with resolver cap
        ts::next_tx(&mut scenario, THIRD_PARTY);
        transfer::public_transfer(resolver_cap, THIRD_PARTY);
        
        ts::next_tx(&mut scenario, THIRD_PARTY);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            
            escrow_src::public_withdraw(
                escrow,
                SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, resolver_cap);
        };
        
        // Verify TAKER received tokens (in src escrow, public_withdraw sends to taker)
        ts::next_tx(&mut scenario, TAKER);
        {
            let tokens = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&tokens) == DEPOSIT_AMOUNT, 0);
            ts::return_to_sender(&scenario, tokens);
        };
        
        // Verify THIRD_PARTY received safety deposit (caller gets safety deposit)
        ts::next_tx(&mut scenario, THIRD_PARTY);
        {
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&safety_deposit) == SAFETY_DEPOSIT_AMOUNT, 1);
            ts::return_to_sender(&scenario, safety_deposit);
        };
        
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    public fun test_private_cancel() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time to cancellation period
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR * 3 + 100);
        
        // TAKER cancels
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            
            escrow_src::cancel(
                escrow,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
        };
        
        // Verify MAKER received tokens back
        ts::next_tx(&mut scenario, MAKER);
        {
            let tokens = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&tokens) == DEPOSIT_AMOUNT, 0);
            ts::return_to_sender(&scenario, tokens);
        };
        
        // Verify TAKER received safety deposit back
        ts::next_tx(&mut scenario, TAKER);
        {
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&safety_deposit) == SAFETY_DEPOSIT_AMOUNT, 1);
            ts::return_to_sender(&scenario, safety_deposit);
        };
        
        ts::return_to_sender(&scenario, resolver_cap);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    public fun test_public_cancel_with_resolver_cap() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time to public cancellation period
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR * 4 + 100);
        
        // THIRD_PARTY cancels with resolver cap
        ts::next_tx(&mut scenario, THIRD_PARTY);
        transfer::public_transfer(resolver_cap, THIRD_PARTY);
        
        ts::next_tx(&mut scenario, THIRD_PARTY);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            
            escrow_src::public_cancel(
                escrow,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, resolver_cap);
        };
        
        // Verify MAKER received tokens back
        ts::next_tx(&mut scenario, MAKER);
        {
            let tokens = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&tokens) == DEPOSIT_AMOUNT, 0);
            ts::return_to_sender(&scenario, tokens);
        };
        
        // Verify THIRD_PARTY received safety deposit (caller gets safety deposit)
        ts::next_tx(&mut scenario, THIRD_PARTY);
        {
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&safety_deposit) == SAFETY_DEPOSIT_AMOUNT, 1);
            ts::return_to_sender(&scenario, safety_deposit);
        };
        
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = htlc::errors::EInvalidSecret, location = htlc::escrow_src)]
    public fun test_withdraw_with_wrong_secret() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time to withdrawal period
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);
        
        // Try to withdraw with wrong secret
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            
            escrow_src::withdraw(
                escrow,
                WRONG_SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
        };
        
        ts::return_to_sender(&scenario, resolver_cap);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = htlc::errors::EOnlyTaker, location = htlc::escrow_src)]
    public fun test_unauthorized_private_withdraw() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time to withdrawal period
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);
        
        // THIRD_PARTY tries to withdraw (should fail)
        ts::next_tx(&mut scenario, THIRD_PARTY);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            
            escrow_src::withdraw(
                escrow,
                SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
        };
        
        ts::return_to_sender(&scenario, resolver_cap);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = htlc::errors::EContractNotExpired, location = htlc::escrow_src)]
    public fun test_withdraw_before_time() {
        let (mut scenario, clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Try to withdraw before withdrawal time (should fail)
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            
            escrow_src::withdraw(
                escrow,
                SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
        };
        
        ts::return_to_sender(&scenario, resolver_cap);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = htlc::errors::EContractExpired, location = htlc::escrow_src)]
    public fun test_withdraw_after_cancellation_time() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time past cancellation time
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR * 3 + 100);
        
        // Try to withdraw after cancellation time (should fail)
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            
            escrow_src::withdraw(
                escrow,
                SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
        };
        
        ts::return_to_sender(&scenario, resolver_cap);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    public fun test_view_functions() {
        let (mut scenario, clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            
            // Test all view functions
            assert!(!escrow_src::can_withdraw(&escrow, &clock), 0);
            assert!(!escrow_src::can_public_withdraw(&escrow, &clock), 1);
            assert!(!escrow_src::can_cancel(&escrow, &clock), 2);
            assert!(!escrow_src::can_public_cancel(&escrow, &clock), 3);
            
            ts::return_shared(escrow);
        };
        
        ts::return_to_sender(&scenario, resolver_cap);
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    public fun test_zero_amount_escrow() {
        let (mut scenario, mut clock) = setup_test();
        
        // Setup capabilities
        ts::next_tx(&mut scenario, ADMIN);
        capabilities::init_for_testing(scenario.ctx());
        
        // Grant resolver cap to TAKER
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<capabilities::AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, TAKER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };
        
        mint_coins<SUI>(&mut scenario, SAFETY_DEPOSIT_AMOUNT, TAKER);
        
        ts::next_tx(&mut scenario, MAKER);
        let zero_deposit = coin::zero<SUI>(scenario.ctx());
        
        ts::next_tx(&mut scenario, TAKER);
        let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
        let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
        
        let escrow = escrow_src::new_escrow_src<SUI>(
            coin::into_balance(zero_deposit),
            coin::into_balance(safety_deposit),
            MAKER,
            TAKER,
            create_hash_lock(),
            &resolver_cap,
            &clock,
            scenario.ctx()
        );
        
        escrow_src::share_escrow_src(escrow);
        
        // Advance time and withdraw
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);
        
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowSrc<SUI>>(&scenario);
            
            escrow_src::withdraw(
                escrow,
                SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
        };
        
        ts::return_to_sender(&scenario, resolver_cap);
        
        // Verify TAKER received only safety deposit (no zero tokens are created)
        ts::next_tx(&mut scenario, TAKER);
        {
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&safety_deposit) == SAFETY_DEPOSIT_AMOUNT, 0);
            ts::return_to_sender(&scenario, safety_deposit);
        };
        
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

}