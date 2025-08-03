module htlc::capabilities {
    use sui::event;

    // Error codes (none needed currently)

    /// Admin capability - allows granting and revoking ResolverCap
    public struct AdminCap has key, store {
        id: object::UID,
    }

    /// Resolver capability - allows calling public withdrawal/cancellation functions
    public struct ResolverCap has key, store {
        id: object::UID,
    }

    /// Event emitted when ResolverCap is granted
    public struct ResolverCapGranted has copy, drop {
        cap_id: object::ID,
        recipient: address,
        granted_by: address,
    }

    /// Event emitted when ResolverCap is revoked  
    public struct ResolverCapRevoked has copy, drop {
        cap_id: object::ID,
        revoked_by: address,
    }

    /// Initialize the module - give deployer both AdminCap and ResolverCap
    fun init(ctx: &mut tx_context::TxContext) {
        let deployer = ctx.sender();
        
        // Create AdminCap for deployer
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        
        // Create ResolverCap for deployer  
        let resolver_cap = ResolverCap {
            id: object::new(ctx),
        };
        
        // Transfer caps to deployer
        transfer::transfer(admin_cap, deployer);
        transfer::transfer(resolver_cap, deployer);
    }

    /// Grant ResolverCap to a user (only admin can call)
    public entry fun grant_resolver_cap(
        _admin_cap: &AdminCap,
        recipient: address,
        ctx: &mut tx_context::TxContext
    ) {
        let resolver_cap = ResolverCap {
            id: object::new(ctx),
        };
        
        let cap_id = object::uid_to_inner(&resolver_cap.id);
        
        // Emit event
        event::emit(ResolverCapGranted {
            cap_id,
            recipient,
            granted_by: ctx.sender(),
        });
        
        // Transfer to recipient
        transfer::transfer(resolver_cap, recipient);
    }

    /// Revoke ResolverCap (admin takes it back and destroys it)
    public entry fun revoke_resolver_cap(
        _admin_cap: &AdminCap,
        resolver_cap: ResolverCap,
        ctx: &mut tx_context::TxContext
    ) {
        let cap_id = object::uid_to_inner(&resolver_cap.id);
        
        // Emit event
        event::emit(ResolverCapRevoked {
            cap_id,
            revoked_by: ctx.sender(),
        });
        
        // Destroy the capability
        let ResolverCap { id } = resolver_cap;
        object::delete(id);
    }

    /// Check if an address has ResolverCap (helper for validation)
    /// Note: This is just for reference - actual validation happens by requiring the cap as parameter
    public fun has_resolver_cap(_cap: &ResolverCap): bool {
        true // If they can provide the cap, they have it
    }

    /// Get AdminCap ID for verification
    public fun get_admin_cap_id(cap: &AdminCap): object::ID {
        object::uid_to_inner(&cap.id)
    }

    /// Get ResolverCap ID for verification
    public fun get_resolver_cap_id(cap: &ResolverCap): object::ID {
        object::uid_to_inner(&cap.id)
    }

    #[test_only]
    /// Test-only init function
    public fun init_for_testing(ctx: &mut tx_context::TxContext) {
        init(ctx);
    }
}