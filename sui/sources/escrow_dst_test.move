#[test_only]
module htlc::escrow_dst_test {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::sui::SUI;
    use htlc::escrow_dst::{Self, EscrowDst};
    use htlc::capabilities::{Self, ResolverCap};

    // Test token for deposits (not SUI to avoid confusion)
    public struct DEPOSIT_COIN has drop {}

    // Test users
    const MAKER: address = @0x1;
    const TAKER: address = @0x2;
    const ADMIN: address = @0x4;

    // Test constants
    const DEPOSIT_AMOUNT: u64 = 2000_000_000; // 1 SUI
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

        // Create escrow - TAKER provides both deposits
        mint_coins<DEPOSIT_COIN>(scenario, DEPOSIT_AMOUNT, TAKER);
        mint_coins<SUI>(scenario, SAFETY_DEPOSIT_AMOUNT, TAKER);
        
        ts::next_tx(scenario, TAKER);
        let escrow_deposit = ts::take_from_sender<Coin<DEPOSIT_COIN>>(scenario);
        let safety_deposit = ts::take_from_sender<Coin<SUI>>(scenario);
        let resolver_cap = ts::take_from_sender<ResolverCap>(scenario);
        
        escrow_dst::create_dst_escrow<DEPOSIT_COIN>(
            escrow_deposit,
            safety_deposit,
            MAKER,
            create_hash_lock(),
            &resolver_cap,
            clock,
            scenario.ctx()
        );
        
        ts::return_to_sender(scenario, resolver_cap);
        
        // Return resolver cap for tests
        ts::next_tx(scenario, TAKER);
        ts::take_from_sender<ResolverCap>(scenario)
    }

    #[test]
    public fun test_escrow_dst_creation() {
        let (mut scenario, clock) = setup_test();
        
        mint_coins<SUI>(&mut scenario, DEPOSIT_AMOUNT, TAKER);
        mint_coins<SUI>(&mut scenario, SAFETY_DEPOSIT_AMOUNT, TAKER);
        
        // Setup capabilities first
        ts::next_tx(&mut scenario, ADMIN);
        capabilities::init_for_testing(scenario.ctx());
        
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<capabilities::AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, TAKER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };

        ts::next_tx(&mut scenario, TAKER);
        {
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            let escrow_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            let resolver_cap = ts::take_from_sender<capabilities::ResolverCap>(&scenario);
            
            escrow_dst::create_dst_escrow<SUI>(
                escrow_deposit,
                safety_deposit,
                MAKER,
                create_hash_lock(),
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, resolver_cap);
        };
        
        // Verify escrow details by taking it from shared state
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<escrow_dst::EscrowDst<SUI>>(&scenario);
            
            let (maker, taker, balance, safety_balance, hash_lock, 
                 withdrawal_time, public_withdrawal_time, cancellation_time, 
                 created_at) = 
                escrow_dst::get_escrow_info(&escrow);
            
            assert!(maker == MAKER, 0);
            assert!(taker == TAKER, 1);
            assert!(balance == DEPOSIT_AMOUNT, 2);
            assert!(safety_balance == SAFETY_DEPOSIT_AMOUNT, 3);
            assert!(hash_lock == create_hash_lock(), 4);
            assert!(withdrawal_time == INITIAL_TIME + 15_000, 5);
            assert!(public_withdrawal_time == INITIAL_TIME + HOUR * 2, 6);
            assert!(cancellation_time == INITIAL_TIME + HOUR * 3, 7);
            assert!(created_at == INITIAL_TIME, 9);
            
            ts::return_shared(escrow);
        };
        clock::destroy_for_testing(clock);
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
            let escrow = ts::take_shared<EscrowDst<DEPOSIT_COIN>>(&scenario);
            
            escrow_dst::withdraw(
                escrow,
                SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, resolver_cap);
        };
        
        // Verify TAKER recv safety_deposit
        ts::next_tx(&mut scenario, TAKER);
        {
            let safety_deposit= ts::take_from_sender<Coin<SUI>>(&scenario);
            let safety_value = coin::value(&safety_deposit);
            assert!(safety_value == SAFETY_DEPOSIT_AMOUNT, 0);
            ts::return_to_sender(&scenario, safety_deposit);
        };
        
        // Verify MAKER recv deposit
        ts::next_tx(&mut scenario, MAKER);
        {
            let deposit= ts::take_from_sender<Coin<DEPOSIT_COIN>>(&scenario);
            let deposit_value = coin::value(&deposit);
            assert!(deposit_value == DEPOSIT_AMOUNT, 0);
            ts::return_to_sender(&scenario, deposit);
        };
        
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    public fun test_public_withdraw() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time to public withdrawal period
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR * 2 + 100);
        
        // TAKER withdraws with resolver cap
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowDst<DEPOSIT_COIN>>(&scenario);
            
            escrow_dst::public_withdraw(
                escrow,
                SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
        };
        
        // Verify MAKER received tokens (in dst escrow, tokens always go to maker)
        ts::next_tx(&mut scenario, MAKER);
        {
            let tokens = ts::take_from_sender<Coin<DEPOSIT_COIN>>(&scenario);
            // TODO: Debug token amount mismatch - temporarily skipping exact amount check
            assert!(coin::value(&tokens) == DEPOSIT_AMOUNT, 0);
            ts::return_to_sender(&scenario, tokens);
        };
        
        // Verify TAKER received safety deposit (caller gets safety deposit)
        ts::next_tx(&mut scenario, TAKER);
        {
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            // TODO: Debug safety deposit amount mismatch - temporarily skipping exact amount check
            assert!(coin::value(&safety_deposit) == SAFETY_DEPOSIT_AMOUNT, 1);
            ts::return_to_sender(&scenario, safety_deposit);
        };
        
        ts::return_to_sender(&scenario, resolver_cap);
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
            let escrow = ts::take_shared<EscrowDst<DEPOSIT_COIN>>(&scenario);
            
            escrow_dst::cancel(
                escrow,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
        };
        
        // Verify TAKER received both tokens and safety deposit back (cancelled by taker)
        ts::next_tx(&mut scenario, TAKER);
        {
            let coin1 = ts::take_from_sender<Coin<SUI>>(&scenario);
            let coin2 = ts::take_from_sender<Coin<DEPOSIT_COIN>>(&scenario);
            
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
    #[expected_failure(abort_code = htlc::errors::EInvalidSecret, location = htlc::escrow_dst)]
    public fun test_withdraw_with_wrong_secret() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time to withdrawal period
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);
        
        // Try to withdraw with wrong secret
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowDst<DEPOSIT_COIN>>(&scenario);
            
            escrow_dst::withdraw(
                escrow,
                WRONG_SECRET,
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
    #[expected_failure(abort_code = htlc::errors::EOnlyTaker, location = htlc::escrow_dst)]
    public fun test_unauthorized_private_withdraw() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time to withdrawal period
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);
        
        // MAKER tries to withdraw (should fail - only taker can withdraw privately)
        ts::next_tx(&mut scenario, MAKER);
        {
            let escrow = ts::take_shared<EscrowDst<DEPOSIT_COIN>>(&scenario);
            
            escrow_dst::withdraw(
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
    #[expected_failure(abort_code = htlc::errors::EContractNotExpired, location = htlc::escrow_dst)]
    public fun test_withdraw_before_time() {
        let (mut scenario, clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Try to withdraw before withdrawal time (should fail)
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowDst<DEPOSIT_COIN>>(&scenario);
            
            escrow_dst::withdraw(
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
    #[expected_failure(abort_code = htlc::errors::EContractExpired, location = htlc::escrow_dst)]
    public fun test_withdraw_after_cancellation_time() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time past cancellation time
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR * 3 + 100);
        
        // Try to withdraw after cancellation time (should fail)
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowDst<DEPOSIT_COIN>>(&scenario);
            
            escrow_dst::withdraw(
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
    #[expected_failure(abort_code = htlc::errors::EOnlyTaker, location = htlc::escrow_dst)]
    public fun test_unauthorized_cancel() {
        let (mut scenario, mut clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Advance time to cancellation period
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR * 3 + 100);
        
        // MAKER tries to cancel (should fail - only taker can cancel privately)
        ts::next_tx(&mut scenario, MAKER);
        {
            let escrow = ts::take_shared<EscrowDst<DEPOSIT_COIN>>(&scenario);
            
            escrow_dst::cancel(
                escrow,
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
    #[expected_failure(abort_code = htlc::errors::EContractNotExpired, location = htlc::escrow_dst)]
    public fun test_cancel_before_time() {
        let (mut scenario, clock) = setup_test();
        let resolver_cap = setup_escrow_with_caps(&mut scenario, &clock);
        
        // Try to cancel before cancellation time (should fail)
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowDst<DEPOSIT_COIN>>(&scenario);
            
            escrow_dst::cancel(
                escrow,
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
            let escrow = ts::take_shared<EscrowDst<DEPOSIT_COIN>>(&scenario);
            
            // Test all view functions
            assert!(!escrow_dst::can_withdraw(&escrow, &clock), 0);
            assert!(!escrow_dst::can_public_withdraw(&escrow, &clock), 1);
            assert!(!escrow_dst::can_cancel(&escrow, &clock), 2);
            
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
        
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<capabilities::AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, TAKER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };
        
        mint_coins<SUI>(&mut scenario, SAFETY_DEPOSIT_AMOUNT, TAKER);
        
        ts::next_tx(&mut scenario, TAKER);
        let zero_deposit = coin::zero<SUI>(scenario.ctx());
        let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
        let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
        
        escrow_dst::create_dst_escrow<SUI>(
            zero_deposit,
            safety_deposit,
            MAKER,
            create_hash_lock(),
            &resolver_cap,
            &clock,
            scenario.ctx()
        );
        
        ts::return_to_sender(&scenario, resolver_cap);
        
        // Advance time and withdraw
        clock::set_for_testing(&mut clock, INITIAL_TIME + HOUR + 100);
        
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowDst<SUI>>(&scenario);
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            
            escrow_dst::withdraw(
                escrow,
                SECRET,
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, resolver_cap);
        };
        
        // Verify TAKER received only safety deposit back (no zero tokens are created)
        ts::next_tx(&mut scenario, TAKER);
        {
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            assert!(coin::value(&safety_deposit) == SAFETY_DEPOSIT_AMOUNT, 0);
            ts::return_to_sender(&scenario, safety_deposit);
        };
        
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    public fun test_entry_function_create_dst_escrow() {
        let (mut scenario, clock) = setup_test();
        
        // Setup capabilities
        ts::next_tx(&mut scenario, ADMIN);
        capabilities::init_for_testing(scenario.ctx());
        
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<capabilities::AdminCap>(&scenario);
            capabilities::grant_resolver_cap(&admin_cap, TAKER, scenario.ctx());
            ts::return_to_sender(&scenario, admin_cap);
        };
        
        // Mint coins for TAKER
        mint_coins<SUI>(&mut scenario, DEPOSIT_AMOUNT, TAKER);
        mint_coins<SUI>(&mut scenario, SAFETY_DEPOSIT_AMOUNT, TAKER);
        
        // TAKER creates dst escrow using entry function
        ts::next_tx(&mut scenario, TAKER);
        {
            let safety_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            let escrow_deposit = ts::take_from_sender<Coin<SUI>>(&scenario);
            let resolver_cap = ts::take_from_sender<capabilities::ResolverCap>(&scenario);
            
            escrow_dst::create_dst_escrow<SUI>(
                escrow_deposit,
                safety_deposit,
                MAKER,
                create_hash_lock(),
                &resolver_cap,
                &clock,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, resolver_cap);
        };
        
        // Verify escrow was created and shared
        ts::next_tx(&mut scenario, TAKER);
        {
            let escrow = ts::take_shared<EscrowDst<SUI>>(&scenario);
            
            let (maker, taker, balance, safety_balance, hash_lock, 
                 _withdrawal_time, _public_withdrawal_time, _cancellation_time, 
                 _created_at) = 
                escrow_dst::get_escrow_info(&escrow);
            
            assert!(maker == MAKER, 0);
            assert!(taker == TAKER, 1);
            assert!(balance == DEPOSIT_AMOUNT, 2);
            assert!(safety_balance == SAFETY_DEPOSIT_AMOUNT, 3);
            assert!(hash_lock == create_hash_lock(), 4);
            
            ts::return_shared(escrow);
        };
        
        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}