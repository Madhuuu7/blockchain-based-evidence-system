import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState
} from "react";

import {
  BrowserProvider,
  Contract
} from "ethers";

import contractAbi from "../utils/contractAbi.json";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const EXPECTED_CHAIN_ID = Number(
  import.meta.env.VITE_CHAIN_ID || 11155111
);

const Web3Context = createContext(null);

/*
|--------------------------------------------------------------------------
| Role names
|--------------------------------------------------------------------------
|
| EvidenceRegistry.sol defines:
|
|   enum Role { NONE, ADMIN, OFFICER, INVESTIGATOR, JUDICIARY }
|
| and exposes a single read function:
|
|   getRole(address account) external view returns (Role)
|
| Solidity enums are returned as their underlying uint8 index, so
| index 0 = NONE, 1 = ADMIN, 2 = OFFICER, 3 = INVESTIGATOR, 4 = JUDICIARY.
| This array's order MUST match that enum exactly.
|
| (There is no OpenZeppelin AccessControl / hasRole(bytes32, address) in
| this contract — roles are a plain enum, not keccak256 role hashes.)
|
*/
const ROLE_INDEX_TO_NAME = [
  "NONE",
  "ADMIN",
  "OFFICER",
  "INVESTIGATOR",
  "JUDICIARY"
];

export function Web3Provider({ children }) {
  const [address, setAddress] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);

  const [role, setRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);

  const [connectError, setConnectError] = useState(null);

  /*
  |--------------------------------------------------------------------------
  | Get contract
  |--------------------------------------------------------------------------
  */
  const getContract = useCallback(
    (needsSigner = false) => {
      if (!CONTRACT_ADDRESS) {
        throw new Error(
          "VITE_CONTRACT_ADDRESS is not configured in frontend/.env"
        );
      }

      if (needsSigner) {
        if (!signer) {
          throw new Error("Wallet not connected");
        }

        return new Contract(
          CONTRACT_ADDRESS,
          contractAbi,
          signer
        );
      }

      if (!provider) {
        throw new Error("Wallet not connected");
      }

      return new Contract(
        CONTRACT_ADDRESS,
        contractAbi,
        provider
      );
    },
    [provider, signer]
  );

  /*
  |--------------------------------------------------------------------------
  | Determine wallet role from blockchain
  |--------------------------------------------------------------------------
  |
  | Calls the contract's real getRole(address) function and maps the
  | returned uint8 enum index to a role name string. This is re-derived
  | fresh from the chain every time — never cached/trusted from anywhere
  | else in the app.
  |
  */
  const fetchUserRole = useCallback(
    async (walletAddress, browserProvider) => {
      if (!walletAddress || !browserProvider || !CONTRACT_ADDRESS) {
        setRole(null);
        return null;
      }

      try {
        setRoleLoading(true);

        const contract = new Contract(
          CONTRACT_ADDRESS,
          contractAbi,
          browserProvider
        );

        const roleIndex = await contract.getRole(walletAddress);
        const roleName = ROLE_INDEX_TO_NAME[Number(roleIndex)];

        if (!roleName || roleName === "NONE") {
          setRole(null);
          return null;
        }

        setRole(roleName);
        return roleName;
      } catch (err) {
        console.error("Failed to determine wallet role:", err);

        setRole(null);

        return null;
      } finally {
        setRoleLoading(false);
      }
    },
    []
  );

  /*
  |--------------------------------------------------------------------------
  | Connect wallet
  |--------------------------------------------------------------------------
  */
  const connect = useCallback(async () => {
    setConnectError(null);

    if (!window.ethereum) {
      setConnectError(
        "MetaMask not detected. Please install the MetaMask browser extension."
      );

      return null;
    }

    try {
      const browserProvider = new BrowserProvider(
        window.ethereum
      );

      const accounts = await browserProvider.send(
        "eth_requestAccounts",
        []
      );

      if (!accounts || accounts.length === 0) {
        throw new Error("No MetaMask account selected.");
      }

      const network = await browserProvider.getNetwork();

      const currentSigner =
        await browserProvider.getSigner();

      const walletAddress = accounts[0];

      const currentChainId = Number(network.chainId);

      setProvider(browserProvider);
      setSigner(currentSigner);
      setAddress(walletAddress);
      setChainId(currentChainId);

      /*
       * Check network
       */
      if (currentChainId !== EXPECTED_CHAIN_ID) {
        setConnectError(
          `Wrong network — please switch MetaMask to chain ID ${EXPECTED_CHAIN_ID}.`
        );

        setRole(null);

        return walletAddress;
      }

      /*
       * Determine blockchain role
       */
      await fetchUserRole(
        walletAddress,
        browserProvider
      );

      return walletAddress;
    } catch (err) {
      console.error("Wallet connection error:", err);

      setConnectError(
        err.message || "Failed to connect wallet"
      );

      return null;
    }
  }, [fetchUserRole]);

  /*
  |--------------------------------------------------------------------------
  | Disconnect wallet
  |--------------------------------------------------------------------------
  */
  const disconnect = useCallback(() => {
    setAddress(null);
    setSigner(null);
    setProvider(null);
    setChainId(null);
    setRole(null);
    setConnectError(null);
  }, []);

  /*
  |--------------------------------------------------------------------------
  | Refresh role
  |--------------------------------------------------------------------------
  */
  const refreshRole = useCallback(async () => {
    if (!provider || !address) {
      setRole(null);
      return null;
    }

    return await fetchUserRole(
      address,
      provider
    );
  }, [
    provider,
    address,
    fetchUserRole
  ]);

  /*
  |--------------------------------------------------------------------------
  | MetaMask account / network changes
  |--------------------------------------------------------------------------
  */
  useEffect(() => {
    if (!window.ethereum) {
      return;
    }

    const restoreWalletState = async () => {
      try {
        const browserProvider = new BrowserProvider(window.ethereum);
        const accounts = await browserProvider.send("eth_accounts", []);

        if (!accounts || accounts.length === 0) {
          return;
        }

        const network = await browserProvider.getNetwork();
        const currentSigner = await browserProvider.getSigner();
        const walletAddress = accounts[0];
        const currentChainId = Number(network.chainId);

        setProvider(browserProvider);
        setSigner(currentSigner);
        setAddress(walletAddress);
        setChainId(currentChainId);

        if (currentChainId === EXPECTED_CHAIN_ID) {
          await fetchUserRole(walletAddress, browserProvider);
        } else {
          setRole(null);
        }
      } catch (err) {
        console.error("Failed to restore wallet state:", err);
        setRole(null);
      }
    };

    restoreWalletState();

    const handleAccountsChanged = async (
      accounts
    ) => {
      if (!accounts || accounts.length === 0) {
        disconnect();
        return;
      }

      try {
        const browserProvider =
          new BrowserProvider(window.ethereum);

        const newSigner =
          await browserProvider.getSigner();

        const network =
          await browserProvider.getNetwork();

        const newAddress = accounts[0];

        setProvider(browserProvider);
        setSigner(newSigner);
        setAddress(newAddress);
        setChainId(Number(network.chainId));

        if (
          Number(network.chainId) !==
          EXPECTED_CHAIN_ID
        ) {
          setConnectError(
            `Wrong network — please switch MetaMask to chain ID ${EXPECTED_CHAIN_ID}.`
          );

          setRole(null);
          return;
        }

        setConnectError(null);

        await fetchUserRole(
          newAddress,
          browserProvider
        );
      } catch (err) {
        console.error(
          "Failed to update account:",
          err
        );

        setRole(null);
      }
    };

    const handleChainChanged = async () => {
      /*
       * Reloading is the safest approach after a
       * MetaMask network change.
       */
      window.location.reload();
    };

    window.ethereum.on(
      "accountsChanged",
      handleAccountsChanged
    );

    window.ethereum.on(
      "chainChanged",
      handleChainChanged
    );

    return () => {
      window.ethereum.removeListener(
        "accountsChanged",
        handleAccountsChanged
      );

      window.ethereum.removeListener(
        "chainChanged",
        handleChainChanged
      );
    };
  }, [
    disconnect,
    fetchUserRole
  ]);

  /*
  |--------------------------------------------------------------------------
  | Role-based permissions
  |--------------------------------------------------------------------------
  |
  | UX convenience only — NOT a security boundary. Every state-changing
  | contract call is independently enforced by require() in
  | EvidenceRegistry.sol regardless of what these flags say.
  |
  */

  const canTransferCustody =
    role === "ADMIN" ||
    role === "INVESTIGATOR";

  const canVerifyEvidence =
    role === "INVESTIGATOR" ||
    role === "JUDICIARY";

  return (
    <Web3Context.Provider
      value={{
        address,
        provider,
        signer,
        chainId,

        role,
        roleLoading,

        connectError,

        connect,
        disconnect,

        getContract,

        refreshRole,

        canTransferCustody,
        canVerifyEvidence,

        expectedChainId:
          EXPECTED_CHAIN_ID
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const ctx = useContext(Web3Context);

  if (!ctx) {
    throw new Error(
      "useWeb3 must be used within a Web3Provider"
    );
  }

  return ctx;
}
