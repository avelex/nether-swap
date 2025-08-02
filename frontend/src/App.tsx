import { useState, useEffect } from "react";
import { WalletProvider, useWallet } from "./hooks/useWallet";
import { CompactChainTokenSelector } from "./components/CompactChainTokenSelector";
import { CompactWalletConnection } from "./components/CompactWalletConnection";
import { ThemeToggle } from "./components/ThemeToggle";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Separator } from "./components/ui/separator";
import { Toaster } from "./components/ui/sonner";
import type { ChainTokenPair } from "./types/chains";
import { ArrowRightLeft, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { ethers } from "ethers";

function CompactDEX() {
  const [fromPair, setFromPair] =
    useState<ChainTokenPair | null>(null);
  const [toPair, setToPair] = useState<ChainTokenPair | null>(
    null,
  );
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [destinationAddress, setDestinationAddress] =
    useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [orderHashes, setOrderHashes] = useState<string[]>([]);
  const [orderStatuses, setOrderStatuses] = useState<Map<string, string>>(new Map());
  const [checkingStatusFor, setCheckingStatusFor] = useState<Set<string>>(new Set());
  const [orderSecrets, setOrderSecrets] = useState<Map<string, string>>(new Map());
  const [orderDetails, setOrderDetails] = useState<Map<string, {
    fromAmount: string;
    fromToken: string;
    fromNetwork: string;
    toAmount: string;
    toToken: string;
    toNetwork: string;
  }>>(new Map());
  const [pollingOrders, setPollingOrders] = useState<Set<string>>(new Set());

  const { walletState, resetConnection } = useWallet();

  // Reset wallet connection when from network changes
  useEffect(() => {
    if (
      fromPair &&
      walletState.isConnected &&
      walletState.chain?.id !== fromPair.chain.id
    ) {
      resetConnection();
      toast.info("Wallet disconnected - network changed");
    }
  }, [fromPair, walletState, resetConnection]);

  // Reset toPair if it's the same network as fromPair
  useEffect(() => {
    if (
      fromPair &&
      toPair &&
      fromPair.chain.id === toPair.chain.id
    ) {
      setToPair(null);
      setToAmount("");
      setDestinationAddress("");
    }
  }, [fromPair, toPair]);

  // Reset amounts when wallet disconnects
  useEffect(() => {
    if (!walletState.isConnected) {
      setFromAmount("");
      setToAmount("");
    }
  }, [walletState.isConnected]);

  // Polling effect for order status
  useEffect(() => {
    if (pollingOrders.size === 0) return;

    const interval = setInterval(() => {
      pollingOrders.forEach(orderHash => {
        checkOrderStatus(orderHash);
      });
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, [pollingOrders]);

  // Check order status function
  const checkOrderStatus = async (orderHash: string) => {
    if (!orderHash) return;

    setCheckingStatusFor(prev => new Set(prev).add(orderHash));
    try {
      const response = await fetch(`http://64.226.101.237:3000/api/swap/${orderHash}`);
      if (response.ok) {
        const data = await response.json();

        // Check transaction hashes to determine actual status
        const escrowSrcTxHash = data.data?.escrowSrcTxHash || data.escrowSrcTxHash;
        const escrowDstTxHash = data.data?.escrowDstTxHash || data.escrowDstTxHash;

        let status;
        if (!escrowSrcTxHash || !escrowDstTxHash) {
          status = 'Pending';
        } else {
          // Both transaction hashes are filled, send secret to backend
          if (orderSecrets.has(orderHash)) {
            const secret = orderSecrets.get(orderHash);
            try {
              const revealResponse = await fetch(`http://64.226.101.237:3000/api/swap/${orderHash}/reveal`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ secret })
              });
              
              if (revealResponse.ok) {
                console.log('Secret revealed successfully for order:', orderHash);
                // Only show completed if reveal was successful
                status = data.status || data.state || 'Completed';
              } else {
                console.warn('Failed to reveal secret for order:', orderHash, 'Status:', revealResponse.status);
                // Keep as pending if reveal failed
                status = 'Pending';
              }
            } catch (secretError) {
              console.warn('Failed to reveal secret for order:', orderHash, secretError);
              // Keep as pending if reveal failed
              status = 'Pending';
            }
          } else {
            // No secret available, but hashes are filled - still show as completed
            status = data.status || data.state || 'Completed';
          }
        }

        setOrderStatuses(prev => new Map(prev).set(orderHash, status));
        
        // Stop polling if order is completed or failed
        if (status === 'Completed' || status === 'error' || status === 'failed') {
          setPollingOrders(prev => {
            const newSet = new Set(prev);
            newSet.delete(orderHash);
            return newSet;
          });
        }
      } else {
        setOrderStatuses(prev => new Map(prev).set(orderHash, 'error'));
        // Stop polling on error
        setPollingOrders(prev => {
          const newSet = new Set(prev);
          newSet.delete(orderHash);
          return newSet;
        });
      }
    } catch (error) {
      setOrderStatuses(prev => new Map(prev).set(orderHash, 'error'));
      // Stop polling on error
      setPollingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderHash);
        return newSet;
      });
    }
    setCheckingStatusFor(prev => {
      const newSet = new Set(prev);
      newSet.delete(orderHash);
      return newSet;
    });
  };

  // Mock exchange rate calculation
  const calculateToAmount = async (amount: string) => {
    if (!amount || !fromPair || !toPair) return;

    setIsCalculating(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const isSameToken =
      fromPair.token.symbol === toPair.token.symbol;
    const exchangeRate = isSameToken
      ? 0.98 + Math.random() * 0.04
      : fromPair.token.symbol === 'SUI' && (toPair.token.symbol === 'USDC' || toPair.token.symbol === 'USDT')
        ? 3.74
        : (fromPair.token.symbol === 'USDC' || fromPair.token.symbol === 'USDT') && toPair.token.symbol === 'SUI'
          ? 1 / 3.74
          : 0.5 + Math.random() * 2;

    const calculatedAmount = (
      parseFloat(amount) * exchangeRate
    ).toFixed(6);
    setToAmount(calculatedAmount);
    setIsCalculating(false);
  };

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value);
    if (value && parseFloat(value) > 0) {
      calculateToAmount(value);
    } else {
      setToAmount("");
    }
  };

  const handleFromPairChange = (pair: ChainTokenPair) => {
    setFromPair(pair);
    setFromAmount("");
    setToAmount("");
  };

  const handleToPairChange = (pair: ChainTokenPair) => {
    setToPair(pair);
    setDestinationAddress("");
    if (fromAmount) {
      calculateToAmount(fromAmount);
    }
  };

  const generateHashLock = (): { hashLock: string; secret: string } => {
    // Generate cryptographically secure random secret (32 bytes)
    const secretBytes = new Uint8Array(32);
    crypto.getRandomValues(secretBytes);

    // Convert secret to hex string
    const secret = Array.from(secretBytes)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');

    // Create SHA-256 hash of the secret using Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(secret);

    // Since we need this synchronously, we'll use a simpler approach
    // In production, you'd want to use crypto.subtle.digest() which is async
    const hashLock = ethers.keccak256(ethers.toUtf8Bytes(secret));

    return { hashLock, secret };
  };

  const handleSwap = () => {
    if (
      !fromPair ||
      !toPair ||
      !fromAmount ||
      !walletState.isConnected
    )
      return;

    // Generate hashlock for atomic cross-chain swap
    const { hashLock, secret } = generateHashLock();

    // Map chain IDs to numeric values (from common chain ID standards)
    const getChainId = (chainId: string): number => {
      switch (chainId) {
        case 'arbitrum': return 42161;
        case 'sui': return 101;
        default: return 1;
      }
    };

    // Ensure correct address format for source chain
    const getUserAddress = () => {
      if (walletState.address) {
        return walletState.address;
      }
      // Default addresses based on source chain
      return fromPair.chain.walletType === 'metamask'
        ? "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"  // Ethereum-style
        : "0xf0c0382b51dbcbde593728d1baa28f31a2cf82ce8e0fedc8418be613a6388487"; // Sui-style
    };

    const getReceiver = () => {
      if (destinationAddress) {
        return destinationAddress;
      }
      if (walletState.address && toPair.chain.walletType === fromPair.chain.walletType) {
        return walletState.address;
      }
      // Default receiver based on destination chain
      return toPair.chain.walletType === 'metamask'
        ? "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"  // Ethereum-style
        : "0xf0c0382b51dbcbde593728d1baa28f31a2cf82ce8e0fedc8418be613a6388487"; // Sui-style
    };

    // Form the request body according to the specification
    const requestBody = {
      userAddress: getUserAddress(),
      tokenAmount: fromAmount,
      srcChainId: getChainId(fromPair.chain.id),
      dstChainId: getChainId(toPair.chain.id),
      srcChainAsset: fromPair.token.address,
      dstChainAsset: toPair.token.address,
      receiver: getReceiver(),
      hashLock: hashLock
    };

    // Complete swap flow for Ethereum to Sui
    const executeEthToSuiSwapFlow = async () => {
      try {
        requestBody.dstChainId = 1;

        // Step 1: Build order
        toast.info('Building swap order...');
        const buildResponse = await fetch('http://64.226.101.237:3000/api/swap/eth_to_sui/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        if (!buildResponse.ok) {
          let errorMessage = `HTTP error! status: ${buildResponse.status}`;
          try {
            const errorData = await buildResponse.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch (e) {
            // ignore
          }
          throw new Error(errorMessage);
        }

        const buildData = await buildResponse.json();

        if (!buildData.success || !buildData.data) {
          throw new Error('Invalid build response');
        }

        const { types, domain, message } = buildData.data;

        // Step 2: Sign EIP-712 message
        toast.info('Please sign the transaction...');

        if (!window.ethereum) {
          throw new Error('MetaMask not found');
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        // Filter out EIP712Domain from types for ethers.js
        const { EIP712Domain, ...filteredTypes } = types;

        // Create the EIP-712 signature
        const signature = await signer.signTypedData(domain, filteredTypes, message);

        // Step 3: Check if token approval is needed
        const tokenAddress = requestBody.srcChainAsset;
        const spenderAddress = domain.verifyingContract;
        const amount = ethers.parseUnits(requestBody.tokenAmount, 6); // USDC has 6 decimals

        try {
          // Check current allowance
          const tokenContract = new ethers.Contract(
            tokenAddress,
            ['function allowance(address owner, address spender) view returns (uint256)'],
            provider
          );

          const currentAllowance = await tokenContract.allowance(requestBody.userAddress, spenderAddress);

          if (currentAllowance < amount) {
            toast.info('Approving token spend...');

            const tokenWithSigner = new ethers.Contract(
              tokenAddress,
              ['function approve(address spender, uint256 amount) returns (bool)'],
              signer
            );

            const approveTx = await tokenWithSigner.approve(spenderAddress, amount);
            await approveTx.wait();

            toast.success('Token approval confirmed');
          }
        } catch (approvalError) {
          console.warn('Token approval check/execution failed:', approvalError);
          // Continue anyway - might not be needed or might be handled differently
        }

        // Step 4: Execute the swap
        toast.info('Executing swap...');

        // Generate proper EIP-712 hash
        const orderHash = ethers.TypedDataEncoder.hash(
          domain,
          { Order: types.Order },
          message
        );

        // Store the secret for this order hash
        setOrderSecrets(prev => new Map(prev).set(orderHash, secret));
        
        // Store order details for this hash
        setOrderDetails(prev => new Map(prev).set(orderHash, {
          fromAmount,
          fromToken: fromPair.token.symbol,
          fromNetwork: fromPair.chain.name,
          toAmount,
          toToken: toPair.token.symbol,
          toNetwork: toPair.chain.name
        }));

        const executeRequestBody = {
          signature,
          orderHash
        };

        const executeResponse = await fetch('http://64.226.101.237:3000/api/swap/eth_to_sui', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(executeRequestBody)
        });

        if (!executeResponse.ok) {
          let errorMessage = `HTTP error! status: ${executeResponse.status}`;
          try {
            const errorText = await executeResponse.text();
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData.message || errorData.error || errorMessage;
            } catch (parseError) {
              errorMessage = errorText || errorMessage;
            }
          } catch (e) {
            // ignore
          }
          throw new Error(errorMessage);
        }

        const executeResponseText = await executeResponse.text();

        // Check if response is JSON or plain text
        const contentType = executeResponse.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
          // Handle JSON response
          try {
            const executeData = JSON.parse(executeResponseText);

            toast.success(
              `Swap completed: ${fromAmount} ${fromPair.token.symbol} → ${toAmount} ${toPair.token.symbol}`,
            );
          } catch (parseError) {
            console.error('JSON parse error:', parseError);
            throw new Error(`Invalid JSON response: ${executeResponseText}`);
          }
        } else {
          // Handle text/HTML response (likely async processing)

          toast.success(
            `Swap request submitted: ${fromAmount} ${fromPair.token.symbol} → ${toPair.token.symbol}. Check status below.`,
          );

          // Save order hash and check initial status
          setOrderHashes(prev => [orderHash, ...prev]);
          setOrderStatuses(prev => new Map(prev).set(orderHash, "Submitted"));

          // Start polling for this order
          setPollingOrders(prev => new Set(prev).add(orderHash));

          // Check status after a short delay
          setTimeout(() => checkOrderStatus(orderHash), 2000);
        }

      } catch (error) {
        toast.error(
          `Swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    };

    // Complete swap flow for Sui to Ethereum
    const executeSuiToEthSwapFlow = async () => {
      try {
        // Build request body for sui_to_any/build endpoint
        const suiBuildRequestBody = {
          srcChainId: getChainId(fromPair.chain.id),
          dstChainId: getChainId(toPair.chain.id),
          userAddress: getUserAddress(),
          tokenAmount: parseFloat(fromAmount),
          srcChainAsset: fromPair.token.address,
          dstChainAsset: toPair.token.address,
          hashLock: hashLock,
          receiver: getReceiver()
        };


        // Step 1: Build order for Sui to Ethereum
        toast.info('Building Sui to Ethereum swap order...');
        const buildResponse = await fetch('http://64.226.101.237:3000/api/swap/sui_to_any/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(suiBuildRequestBody)
        });

        if (!buildResponse.ok) {
          let errorMessage = `HTTP error! status: ${buildResponse.status}`;
          try {
            const errorData = await buildResponse.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch (e) {
            // ignore
          }
          throw new Error(errorMessage);
        }

        const buildData = await buildResponse.json();

        if (!buildData.success || !buildData.data) {
          throw new Error('Invalid build response');
        }

        // Sign transaction using detected SUI wallet
        toast.info('Please approve the transaction in your SUI wallet...');

        // Reuse wallet detection to find same wallet used for connection
        const { detectSuiWallets } = await import('./hooks/useWallet');
        const availableWallets = await detectSuiWallets();
        console.log('Available wallets for transaction:', availableWallets);
        
        if (availableWallets.length === 0) {
          throw new Error('No SUI wallet found for transaction signing.');
        }

        const selectedWallet = availableWallets[0];
        console.log('Using wallet for transaction:', selectedWallet);
        
        let suiWallet: any = selectedWallet.wallet || selectedWallet;

        // Establish wallet account context for transaction signing
        let currentAccount;
        try {
          // Attempt various account access methods depending on wallet type
          if (suiWallet.account) {
            currentAccount = await suiWallet.account();
          } else if (suiWallet.getAccount) {
            currentAccount = await suiWallet.getAccount();
          }
        } catch (accountError) {
          // Fallback: request account access if not already available
          try {
            if (suiWallet.requestAccount) {
              currentAccount = await suiWallet.requestAccount();
            } else if (suiWallet.connect) {
              currentAccount = await suiWallet.connect();
            }
          } catch (requestError) {
            console.log('Failed to get account:', requestError);
          }
        }

        // The build response contains signature and bytes - we only need to sign the bytes
        const { bytes, signature: apiSignature } = buildData.data;

        try {
          let Transaction, SuiClient;
          try {
            const transactionModule = await import('@mysten/sui/transactions');
            const clientModule = await import('@mysten/sui/client');
            Transaction = transactionModule.Transaction;
            SuiClient = clientModule.SuiClient;
          } catch (importError) {
            throw new Error('Sui SDK components not available: ' + (importError instanceof Error ? importError.message : String(importError)));
          }

          const suiClient = new SuiClient({
            url: 'https://fullnode.testnet.sui.io:443'
          });

          let transaction;
          try {
            // Use raw Transaction object - wallets need .toJSON() method
            transaction = Transaction.from(bytes);
          } catch (parseError) {
            throw new Error('Invalid transaction bytes from API');
          }

          let signedTx;

          console.log('Attempting to sign transaction with wallet:', suiWallet);
          console.log('Wallet features:', suiWallet.features);
          console.log('Transaction object:', transaction);

          // Prioritize wallet standard signing features
          if (suiWallet.features && suiWallet.features['sui:signTransaction']) {
            console.log('Using wallet standard sui:signTransaction');
            signedTx = await suiWallet.features['sui:signTransaction'].signTransaction({ 
              transaction: transaction,
              chain: 'sui:testnet'
            });
          } else if (suiWallet.features && suiWallet.features['sui:signAndExecuteTransaction']) {
            console.log('Using wallet standard sui:signAndExecuteTransaction');
            signedTx = await suiWallet.features['sui:signAndExecuteTransaction'].signAndExecuteTransaction({ 
              transaction: transaction,
              chain: 'sui:testnet'
            });
          } 
          // Legacy fallback for non-standard wallet interfaces
          else if (suiWallet.signTransaction) {
            console.log('Using direct signTransaction method');
            signedTx = await suiWallet.signTransaction(transaction);
          } else if (suiWallet.signTransactionBlock) {
            console.log('Using direct signTransactionBlock method');
            signedTx = await suiWallet.signTransactionBlock({ transactionBlock: transaction });
          } else if (suiWallet.signAndExecuteTransactionBlock) {
            console.log('Using direct signAndExecuteTransactionBlock method');
            signedTx = await suiWallet.signAndExecuteTransactionBlock({ transactionBlock: transaction, options: { showEffects: true } });
          } else {
            console.error('No compatible signing method found. Available methods:', Object.keys(suiWallet));
            if (suiWallet.features) {
              console.error('Available features:', Object.keys(suiWallet.features));
            }
            throw new Error('SUI wallet does not support any known transaction signing methods');
          }

          toast.success('Sui transaction signed successfully');

          toast.info('Submitting swap execution...');

          const executeRequestBody = {
            userIntent: {
              srcChainId: suiBuildRequestBody.srcChainId,
              dstChainId: suiBuildRequestBody.dstChainId,
              userAddress: suiBuildRequestBody.userAddress,
              tokenAmount: Math.floor(suiBuildRequestBody.tokenAmount * Math.pow(10, fromPair.token.decimals)), // Convert to smallest unit
              srcChainAsset: suiBuildRequestBody.srcChainAsset,
              dstChainAsset: suiBuildRequestBody.dstChainAsset,
              hashLock: suiBuildRequestBody.hashLock,
              receiver: suiBuildRequestBody.receiver
            },
            userSignature: signedTx.signature
          };


          console.log('Sending request to /api/swap/sui_to_eth:', executeRequestBody);

          const executeResponse = await fetch('http://64.226.101.237:3000/api/swap/sui_to_eth', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(executeRequestBody)
          });

          console.log('Response status:', executeResponse.status);
          console.log('Response headers:', Object.fromEntries(executeResponse.headers.entries()));

          if (!executeResponse.ok) {
            let errorMessage = `HTTP error! status: ${executeResponse.status}`;
            try {
              const errorText = await executeResponse.text();
              console.log('Error response text:', errorText);
              try {
                const errorData = JSON.parse(errorText);
                console.log('Parsed error data:', errorData);
                errorMessage = errorData.message || errorData.error || errorMessage;
              } catch (parseError) {
                console.log('Failed to parse error as JSON:', parseError);
                errorMessage = errorText || errorMessage;
              }
            } catch (e) {
              console.log('Failed to read error response:', e);
            }
            throw new Error(errorMessage);
          }

          const executeResponseText = await executeResponse.text();
          console.log('Success response text:', executeResponseText);
          
          const contentType = executeResponse.headers.get('content-type');
          console.log('Response content-type:', contentType);

          if (contentType && contentType.includes('application/json')) {
            try {
              const executeData = JSON.parse(executeResponseText);
              console.log('Parsed success response data:', executeData);

              if (executeData.success && executeData.data) {
                const { orderHash, suiEscrowObjectId } = executeData.data;
                console.log('Extracted order details:', { orderHash, suiEscrowObjectId });

                // Store the secret for this order hash
                setOrderSecrets(prev => new Map(prev).set(orderHash, secret));
                
                // Store order details for this hash
                setOrderDetails(prev => new Map(prev).set(orderHash, {
                  fromAmount,
                  fromToken: fromPair.token.symbol,
                  fromNetwork: fromPair.chain.name,
                  toAmount,
                  toToken: toPair.token.symbol,
                  toNetwork: toPair.chain.name
                }));

                toast.success(
                  `Sui to Ethereum swap completed: ${fromAmount} ${fromPair.token.symbol} → ${toAmount} ${toPair.token.symbol}`,
                );

                // Save order hash and check initial status
                setOrderHashes(prev => [orderHash, ...prev]);
                setOrderStatuses(prev => new Map(prev).set(orderHash, "Submitted"));

                // Start polling for this order
                setPollingOrders(prev => new Set(prev).add(orderHash));

                // Check status after a short delay
                setTimeout(() => checkOrderStatus(orderHash), 2000);
              } else {
                console.error('Invalid response structure:', executeData);
                throw new Error('Invalid execution response - missing success or data fields');
              }
            } catch (parseError) {
              console.error('JSON parse error:', parseError);
              console.error('Raw response that failed to parse:', executeResponseText);
              throw new Error(`Invalid JSON response: ${executeResponseText}`);
            }
          } else {
            console.error('Unexpected content type. Expected JSON but got:', contentType);
            console.error('Response text:', executeResponseText);
            throw new Error('Expected JSON response from swap execution');
          }

        } catch (walletError) {
          console.error('SUI wallet transaction failed:', walletError);
          throw new Error(`SUI wallet transaction failed: ${walletError instanceof Error ? walletError.message : 'Unknown error'}`);
        }

      } catch (error) {
        toast.error(
          `Sui to Ethereum swap failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    };

    // Determine swap direction and execute appropriate flow
    if (fromPair.chain.walletType === 'metamask' && toPair.chain.walletType === 'sui') {
      // Ethereum to Sui swap
      executeEthToSuiSwapFlow();
    } else if (fromPair.chain.walletType === 'sui' && toPair.chain.walletType === 'metamask') {
      // Sui to Ethereum swap
      executeSuiToEthSwapFlow();
    } else {
      toast.error('Unsupported swap direction');
    }
  };

  const isCrossChain = fromPair?.chain.id !== toPair?.chain.id;
  const canSwap =
    fromPair &&
    toPair &&
    fromAmount &&
    parseFloat(fromAmount) > 0 &&
    walletState.isConnected &&
    (!isCrossChain || destinationAddress);

  const showAmountField =
    fromPair &&
    walletState.isConnected &&
    walletState.chain?.id === fromPair.chain.id;

  // Determine which component should be highlighted based on the current step
  const getHighlightedComponent = () => {
    if (!fromPair) return 'from-selector';
    if (!walletState.isConnected) return 'wallet-connection';
    if (!toPair) return 'to-selector';
    if (!fromAmount) return 'amount-input';
    if (isCrossChain && !destinationAddress) return 'destination-address';
    return null;
  };

  const highlightedComponent = getHighlightedComponent();

  // Helper function to get highlight classes
  const getHighlightClasses = (componentName: string) => {
    return highlightedComponent === componentName
      ? 'ring-2 ring-blue-500 dark:ring-blue-400 border-blue-500 dark:border-blue-400'
      : '';
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8 relative">
          <div className="absolute top-0 right-0">
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <h1>🔮 Nether Swap</h1>
          </div>
          <p className="text-sm text-muted-foreground">
           Unlocking a portal between worlds for secure Ethereum and Sui swaps
          </p>
        </div>

        {/* Main Interface */}
        <Card className="max-w-3xl mx-auto p-6">
          <div className="space-y-6">
            {/* From Section */}
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-6">
                <label className="text-sm text-muted-foreground mb-2 block">
                  From
                </label>
                <CompactChainTokenSelector
                  selectedPair={fromPair}
                  onPairSelect={handleFromPairChange}
                  placeholder="Select source token"
                  className={getHighlightClasses('from-selector')}
                />
              </div>

              <div className="col-span-6">
                {showAmountField ? (
                  <>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      Amount
                    </label>
                    <Input
                      type="number"
                      placeholder="0.0"
                      value={fromAmount}
                      onChange={(e) =>
                        handleFromAmountChange(e.target.value)
                      }
                      className={`text-right ${getHighlightClasses('amount-input')}`}
                    />
                  </>
                ) : (
                  <>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      Wallet
                    </label>
                    <div className={`h-9 flex items-center ${getHighlightClasses('wallet-connection')}`}>
                      <CompactWalletConnection
                        requiredPair={fromPair}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowDown className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* To Section */}
            <div className="grid grid-cols-12 gap-4 items-end">
              <div className="col-span-6">
                <label className="text-sm text-muted-foreground mb-2 block">
                  To
                </label>
                <CompactChainTokenSelector
                  selectedPair={toPair}
                  onPairSelect={handleToPairChange}
                  placeholder="Select destination token"
                  excludeChainId={fromPair?.chain.id}
                  className={getHighlightClasses('to-selector')}
                />
              </div>

              <div className="col-span-6">
                {showAmountField && toPair ? (
                  <>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      You get
                    </label>
                    <div className="relative">
                      <div className="h-9 px-3 py-2 border border-input bg-muted/50 rounded-md text-right text-muted-foreground flex items-center justify-end">
                        {isCalculating ? (
                          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                        ) : (
                          toAmount || "0.0"
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      Destination
                    </label>
                    <div className="h-9 flex items-center justify-center">
                      {toPair ? (
                        <div className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                          <img src={toPair.chain.icon} alt={toPair.chain.name} className="w-3 h-3" />
                          {toPair.chain.name}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          Select destination
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Cross-chain destination address */}
            {isCrossChain &&
              walletState.isConnected &&
              toPair && (
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    Destination Address ({toPair.chain.name})
                  </label>
                  <Input
                    placeholder={
                      toPair.chain.walletType === "metamask"
                        ? "e.g. 0x742d35Cc6634C0532925a3b8D8A6aE93cC8A6b7d"
                        : "e.g. 0xf0c0382b51dbcbde593728d1baa28f31a2cf82ce8e0fedc8418be613a6388487"
                    }
                    value={destinationAddress}
                    onChange={(e) =>
                      setDestinationAddress(e.target.value)
                    }
                    className={`font-mono text-xs ${getHighlightClasses('destination-address')}`}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
              )}

            {/* Wallet Status */}
            {walletState.isConnected && (
              <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                <span className="text-sm text-muted-foreground">
                  Connected:
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm">
                    {walletState.address}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {parseFloat(walletState.balance).toFixed(4)}{" "}
                    {walletState.chain?.symbol}
                  </span>
                </div>
              </div>
            )}

            {/* Swap details */}
            {fromAmount && toAmount && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Rate:
                  </span>
                  <span>
                    1 {fromPair?.token.symbol} ={" "}
                    {(
                      parseFloat(toAmount) /
                      parseFloat(fromAmount)
                    ).toFixed(6)}{" "}
                    {toPair?.token.symbol}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Network Fee:
                  </span>
                  <span>{fromPair?.chain.id === 'arbitrum' ? '~$0.10' : fromPair?.chain.id === 'ethereum' ? '~$15.00' : '~$0.01'}</span>
                </div>
                {isCrossChain && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Bridge Fee:
                    </span>
                    <span>0.1%</span>
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Swap Button */}
            <Button
              onClick={handleSwap}
              disabled={!canSwap}
              className={`w-full ${canSwap && fromPair && toPair && fromAmount && walletState.isConnected && (!isCrossChain || destinationAddress)
                ? "bg-green-600 hover:bg-green-700 text-white"
                : ""
                }`}
              size="lg"
            >
              {!fromPair
                ? "Select Source Token"
                : !walletState.isConnected
                  ? "Connect Wallet"
                  : !toPair
                    ? "Select Destination Token"
                    : !fromAmount
                      ? "Enter Amount"
                      : isCrossChain && !destinationAddress
                        ? "Enter Destination Address"
                        : `Swap ${fromPair?.token.symbol} → ${toPair?.token.symbol}`}
            </Button>

            {/* Order Status Buttons */}
            {orderHashes.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground mb-2">
                  Order History ({orderHashes.length})
                </div>
                {orderHashes.slice(0, 5).map((orderHash, index) => {
                  const isChecking = checkingStatusFor.has(orderHash);
                  const isPolling = pollingOrders.has(orderHash);
                  const status = orderStatuses.get(orderHash);
                  const details = orderDetails.get(orderHash);
                  const shortHash = `${orderHash.slice(0, 6)}...${orderHash.slice(-4)}`;

                  return (
                    <Button
                      key={orderHash}
                      onClick={() => checkOrderStatus(orderHash)}
                      disabled={isChecking}
                      variant="outline"
                      className={`w-full text-left justify-between h-auto p-3 ${isPolling ? 'border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/20' : ''}`}
                    >
                      <div className="flex flex-col items-start gap-1">
                        <div className="flex items-center gap-2">
                          <span 
                            className="font-mono text-xs text-muted-foreground hover:text-blue-600 cursor-pointer" 
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(`http://64.226.101.237:3000/api/swap/${orderHash}`);
                              toast.success('API URL copied to clipboard');
                            }}
                          >
                            {shortHash}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            status === 'Pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                            status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                            status === 'Submitted' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' :
                            'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          }`}>
                            {status || 'Check Status'}
                          </span>
                        </div>
                        {details && (
                          <div className="text-xs text-muted-foreground">
                            {details.fromAmount} {details.fromToken} ({details.fromNetwork}) → {details.toAmount} {details.toToken} ({details.toNetwork})
                          </div>
                        )}
                      </div>
                      {isChecking && (
                        <div className="flex items-center gap-2">
                          <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full"></div>
                          <span className="text-xs">Checking...</span>
                        </div>
                      )}
                    </Button>
                  );
                })}
              </div>
            )}

            {/* Cross-chain warning */}
            {isCrossChain && canSwap && (
              <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-2 rounded">
                ⚠️ Cross-chain swap may take 2-5 minutes.
                Double-check your destination address.
              </div>
            )}
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-muted-foreground">
          <p>Demo interface with mock data • Powered by 1inch</p>
        </div>
      </div>

      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <CompactDEX />
    </WalletProvider>
  );
}