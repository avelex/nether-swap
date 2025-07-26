# DEPLOYER SETTINGS
DEPLOYER=0x200F3eed8995472AD495EF8c1CfE74CC2EFF7414
DEPLOYER_PRIVATE_KEY=$(shell echo $$PRIVATE_KEY)

# ARBITRUM
ARBITRUM_ACCESS_TOKEN=0xaf88d065e77c8cC2239327C5EDb3A432268e5831 # USDC
ARBITRUM_FEE_TOKEN=0xaf88d065e77c8cC2239327C5EDb3A432268e5831 # USDC
ARBITRUM_LOP=0x9146cd8fa9A235ba4635A3f8A598C2bCfd453a27
ARBITRUM_RPC=https://arbitrum-one-rpc.publicnode.com

.PHONY: init
init:
	npm install --legacy-peer-deps
	forge install

.PHONY: deploy-limit-order-protocol
deploy-limit-order-protocol:
	npm run deploy:arbitrum

.PHONY: deploy-escrow-factory
deploy-escrow-factory:
	DEPLOYER_ADDRESS=$(DEPLOYER) \
	LOP=$(ARBITRUM_LOP) \
	ACCESS_TOKEN=$(ARBITRUM_ACCESS_TOKEN) \
	FEE_TOKEN=$(ARBITRUM_FEE_TOKEN) \
	forge script script/DeployEscrowFactory.s.sol \
	--fork-url=$(ARBITRUM_RPC) \
	--broadcast \
	-vvvv \
	--via-ir \
	--sender=$(DEPLOYER) \
	--private-key=$(DEPLOYER_PRIVATE_KEY)