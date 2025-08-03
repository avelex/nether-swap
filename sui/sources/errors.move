module htlc::errors {
    // Error codes for the HTLC escrow system
    
    /// Invalid secret provided for withdrawal
    const EInvalidSecret: u64 = 1;
    
    /// Contract has expired (past allowed time window)
    const EContractExpired: u64 = 2;
    
    /// Contract has not yet expired (too early to perform action)
    const EContractNotExpired: u64 = 3;
    
    /// Contract has already been redeemed/withdrawn
    const EAlreadyRedeemed: u64 = 5;
    
    /// Contract has already been refunded/cancelled
    const EAlreadyRefunded: u64 = 6;
    
    /// Insufficient balance for operation
    const EInsufficientBalance: u64 = 7;
    
    /// Generic access denied error
    const ENoAccess: u64 = 8;
    
    /// Only taker can perform this operation
    const EOnlyTaker: u64 = 9;
    
    /// Only maker can perform this operation
    const EOnlyMaker: u64 = 10;
    
    /// Builder has expired (timeout reached)
    const EBuilderExpired: u64 = 11;
    
    /// Builder has not expired yet
    const EBuilderNotExpired: u64 = 12;
    
    // Public getter functions to access error codes from other modules
    public fun invalid_secret(): u64 { EInvalidSecret }
    public fun contract_expired(): u64 { EContractExpired }
    public fun contract_not_expired(): u64 { EContractNotExpired }
    public fun already_redeemed(): u64 { EAlreadyRedeemed }
    public fun already_refunded(): u64 { EAlreadyRefunded }
    public fun insufficient_balance(): u64 { EInsufficientBalance }
    public fun no_access(): u64 { ENoAccess }
    public fun only_taker(): u64 { EOnlyTaker }
    public fun only_maker(): u64 { EOnlyMaker }
    public fun builder_expired(): u64 { EBuilderExpired }
    public fun builder_not_expired(): u64 { EBuilderNotExpired }
}