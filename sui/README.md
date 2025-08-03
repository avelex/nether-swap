# HTLC Sui Move Package

Hash Time-Locked Contract (HTLC) implementation for Sui blockchain.

## Build

```bash
make build
# or
sui move build
```

## Deploy

```bash
make deploy
# or
sui client publish
```

## Test Coverage

Run all tests:
```bash
sui move test
```

Generate coverage report:
```bash
sui move test --coverage
sui move coverage summary
```

**Test Results**: 36/36 tests passing (100% pass rate)

**Coverage Summary**:
- **Overall Coverage**: 92.18%
- capabilities: 100.00%
- escrow_src_builder: 95.90%
- escrow_dst: 92.25%
- escrow_src: 90.78%
- errors: 63.64%