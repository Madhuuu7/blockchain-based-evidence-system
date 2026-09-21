import React, { useEffect, useState } from "react";
import { getAddress, isAddress } from "ethers";
import Layout from "../components/Layout.jsx";
import { useWeb3 } from "../context/Web3Context.jsx";
import api from "../services/api.js";

const ROLE_ENUM = {
  NONE: 0,
  ADMIN: 1,
  OFFICER: 2,
  INVESTIGATOR: 3,
  JUDICIARY: 4,
};

export default function Users() {
  const {
    address,
    chainId,
    expectedChainId,
    connect,
    getContract,
  } = useWeb3();

  const [users, setUsers] = useState([]);

  const [form, setForm] = useState({
    address: "",
    role: "OFFICER",
  });

  const [status, setStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  /*
   * Load users
   */
  const load = async () => {
    try {
      const { data } = await api.get("/users");
      setUsers(data.results || []);
    } catch (err) {
      console.error("LOAD USERS ERROR:", err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /*
   * Assign blockchain role
   */
  const handleAssign = async (e) => {
    e.preventDefault();

    setStatus("pending");
    setErrorMessage("");

    try {
      /*
       * 1. Make sure MetaMask is connected.
       */
      let connectedAddress = address;

      if (!connectedAddress) {
        connectedAddress = await connect();
      }

      if (!connectedAddress) {
        throw new Error(
          "MetaMask wallet is not connected."
        );
      }

      /*
       * 2. Check network.
       */
      if (Number(chainId) !== Number(expectedChainId)) {
        throw new Error(
          `Wrong network. MetaMask is on chain ${chainId}, but this application requires chain ${expectedChainId}.`
        );
      }

      /*
       * 3. Validate wallet address.
       */
      const rawAddress = form.address.trim();

      if (!rawAddress) {
        throw new Error(
          "Please enter the wallet address."
        );
      }

      if (!isAddress(rawAddress)) {
        throw new Error(
          "Invalid wallet address. Please enter the complete 42-character Ethereum address."
        );
      }

      /*
       * Normalize address.
       *
       * This is important because ethers v6 can otherwise
       * attempt ENS resolution when the supplied string
       * is not recognized as a valid Ethereum address.
       */
      const targetAddress = getAddress(rawAddress);

      /*
       * 4. Validate role.
       */
      const roleValue = ROLE_ENUM[form.role];

      if (roleValue === undefined) {
        throw new Error(
          "Invalid role selected."
        );
      }

      console.log("ROLE ASSIGNMENT");
      console.log("Admin wallet:", connectedAddress);
      console.log("Target wallet:", targetAddress);
      console.log("Role:", form.role);
      console.log("Role value:", roleValue);
      console.log("Chain ID:", chainId);

      /*
       * 5. Get contract with MetaMask signer.
       */
      const contract = getContract(true);

      /*
       * 6. Send transaction.
       *
       * MetaMask should open here.
       */
      const tx = await contract.assignRole(
        targetAddress,
        roleValue
      );

      console.log("Transaction submitted:", tx.hash);

      /*
       * 7. Wait for blockchain confirmation.
       */
      await tx.wait();

      console.log(
        "Role assignment confirmed:",
        tx.hash
      );

      /*
       * 8. Update MongoDB cache.
       *
       * Blockchain remains authoritative.
       */
      try {
        await api.post("/users/role", {
          walletAddress: targetAddress,
        });
      } catch (syncError) {
        console.warn(
          "MongoDB role cache sync failed:",
          syncError
        );
      }

      setStatus("success");
      setErrorMessage("");

      /*
       * Clear address field.
       */
      setForm({
        address: "",
        role: "OFFICER",
      });

      /*
       * Reload users.
       */
      await load();
    } catch (err) {
      console.error(
        "ROLE ASSIGNMENT ERROR:",
        err
      );

      console.error(
        "ERROR MESSAGE:",
        err?.message
      );

      console.error(
        "ERROR SHORT MESSAGE:",
        err?.shortMessage
      );

      console.error(
        "ERROR REASON:",
        err?.reason
      );

      console.error(
        "ERROR CODE:",
        err?.code
      );

      console.error(
        "ERROR DATA:",
        err?.data
      );

      /*
       * Human-readable error
       */
      let message =
        err?.shortMessage ||
        err?.reason ||
        err?.message ||
        "Role assignment failed.";

      /*
       * Common MetaMask rejection.
       */
      if (
        err?.code === 4001 ||
        err?.code === "ACTION_REJECTED"
      ) {
        message =
          "Transaction was rejected in MetaMask.";
      }

      /*
       * Wrong network.
       */
      if (
        message.toLowerCase().includes("wrong network")
      ) {
        message =
          `Wrong MetaMask network. Please use Hardhat Local (chain ${expectedChainId}).`;
      }

      /*
       * Wallet not connected.
       */
      if (
        message
          .toLowerCase()
          .includes("wallet not connected")
      ) {
        message =
          "MetaMask is not connected to this application.";
      }

      setErrorMessage(message);
      setStatus("error");
    }
  };

  return (
    <Layout>
      <h1 className="text-lg font-semibold text-slate-100 mb-6">
        User & Role Management
      </h1>

      <form
        onSubmit={handleAssign}
        className="mb-8 bg-navy-900 border border-navy-700 rounded-xl p-6 flex flex-wrap gap-3 items-end max-w-2xl"
      >
        <div className="flex-1 min-w-[240px]">
          <label className="text-xs text-slate-500">
            Wallet Address
          </label>

          <input
            value={form.address}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                address: e.target.value,
              }))
            }
            className="mt-1 w-full bg-navy-800 border border-navy-700 rounded px-3 py-2 text-sm"
            placeholder="0x..."
            autoComplete="off"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500">
            Role
          </label>

          <select
            value={form.role}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                role: e.target.value,
              }))
            }
            className="mt-1 bg-navy-800 border border-navy-700 rounded px-3 py-2 text-sm"
          >
            {Object.keys(ROLE_ENUM)
              .filter((r) => r !== "NONE")
              .map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={status === "pending"}
          className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed rounded px-4 py-2 text-sm"
        >
          {status === "pending"
            ? "Confirm in MetaMask..."
            : "Assign Role"}
        </button>
      </form>

      {status === "success" && (
        <div className="text-sm text-green-400 mb-4">
          Role assigned successfully.
        </div>
      )}

      {status === "error" && (
        <div className="text-sm text-status-danger mb-4 break-words">
          {errorMessage ||
            "Role assignment failed or was rejected."}
        </div>
      )}

      <div className="bg-navy-900 border border-navy-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy-800 text-slate-400 text-left">
            <tr>
              <th className="px-4 py-3">
                Wallet
              </th>

              <th className="px-4 py-3">
                Live Role (on-chain)
              </th>

              <th className="px-4 py-3">
                Last Login
              </th>
            </tr>
          </thead>

          <tbody>
            {users.map((u) => (
              <tr
                key={u._id}
                className="border-t border-navy-700"
              >
                <td className="px-4 py-3 break-all">
                  {u.walletAddress}
                </td>

                <td className="px-4 py-3">
                  {u.liveRole}
                </td>

                <td className="px-4 py-3 text-slate-500">
                  {u.lastLoginAt
                    ? new Date(
                        u.lastLoginAt
                      ).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}