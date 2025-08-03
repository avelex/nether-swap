#[test_only]
module htlc::capabilities_test {
    use sui::test_scenario::{Self as ts};
    use htlc::capabilities::{Self, AdminCap, ResolverCap};

    // Test users
    const ADMIN: address = @0x1;
    const RESOLVER1: address = @0x2;
    const RESOLVER2: address = @0x3;

    #[test]
    public fun test_init_gives_caps_to_deployer() {
        let mut scenario = ts::begin(ADMIN);
        
        // Init should be called automatically, but we can call it explicitly for testing
        capabilities::init_for_testing(scenario.ctx());
        
        // Admin should receive both AdminCap and ResolverCap
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            
            // Just verify we can take them
            ts::return_to_sender(&scenario, admin_cap);
            ts::return_to_sender(&scenario, resolver_cap);
        };
        
        ts::end(scenario);
    }

    #[test]
    public fun test_grant_and_revoke_resolver_cap() {
        let mut scenario = ts::begin(ADMIN);
        
        // Init
        capabilities::init_for_testing(scenario.ctx());
        
        // Admin grants ResolverCap to RESOLVER1
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            
            capabilities::grant_resolver_cap(
                &admin_cap,
                RESOLVER1,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, admin_cap);
        };
        
        // 1 should have received ResolverCap
        ts::next_tx(&mut scenario, RESOLVER1);
        {
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            ts::return_to_sender(&scenario, resolver_cap);
        };
        
        // Admin revokes ResolverCap from 1
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            ts::return_to_sender(&scenario, admin_cap);
        };
        
        // Get the resolver cap from RESOLVER1 to revoke it
        ts::next_tx(&mut scenario, RESOLVER1);
        {
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            transfer::public_transfer(resolver_cap, ADMIN);
        };
        
        // Admin revokes it
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            
            capabilities::revoke_resolver_cap(
                &admin_cap,
                resolver_cap,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, admin_cap);
        };
        
        ts::end(scenario);
    }

    #[test]
    public fun test_multiple_resolver_caps() {
        let mut scenario = ts::begin(ADMIN);
        
        // Init
        capabilities::init_for_testing(scenario.ctx());
        
        // Admin grants ResolverCap to multiple users
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            
            capabilities::grant_resolver_cap(
                &admin_cap,
                RESOLVER1,
                scenario.ctx()
            );
            
            capabilities::grant_resolver_cap(
                &admin_cap,
                RESOLVER2,
                scenario.ctx()
            );
            
            ts::return_to_sender(&scenario, admin_cap);
        };
        
        // Both should have received ResolverCap
        ts::next_tx(&mut scenario, RESOLVER1);
        {
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            ts::return_to_sender(&scenario, resolver_cap);
        };
        
        ts::next_tx(&mut scenario, RESOLVER2);
        {
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            ts::return_to_sender(&scenario, resolver_cap);
        };
        
        ts::end(scenario);
    }

    #[test]
    public fun test_cap_helper_functions() {
        let mut scenario = ts::begin(ADMIN);
        
        // Init
        capabilities::init_for_testing(scenario.ctx());
        
        // Test helper functions
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let resolver_cap = ts::take_from_sender<ResolverCap>(&scenario);
            
            // Test helper functions
            let _admin_id = capabilities::get_admin_cap_id(&admin_cap);
            let _resolver_id = capabilities::get_resolver_cap_id(&resolver_cap);
            let _has_cap = capabilities::has_resolver_cap(&resolver_cap);
            
            ts::return_to_sender(&scenario, admin_cap);
            ts::return_to_sender(&scenario, resolver_cap);
        };
        
        ts::end(scenario);
    }
}