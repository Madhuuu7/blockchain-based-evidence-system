import React, {
  useEffect,
  useState
} from "react";

import { useParams } from "react-router-dom";

import { useWeb3 } from "../context/Web3Context.jsx";

import Layout from "../components/Layout.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

import api from "../services/api.js";


const CUSTODY_ICON = {
  Registered: "📝",
  Accessed: "👁️",
  Transferred: "🔁",
  Verified: "✅"
};


export default function EvidenceDetail() {
  const { id } = useParams();

  const {
    getContract,
    role,
    roleLoading,
    canTransferCustody,
    canVerifyEvidence
  } = useWeb3();


  const [evidence, setEvidence] = useState(null);
  const [history, setHistory] = useState([]);

  const [error, setError] = useState(null);


  // ------------------------------------------------------------
  // Verification state
  // ------------------------------------------------------------

  const [verifyState, setVerifyState] =
    useState("idle");

  const [verifyResult, setVerifyResult] =
    useState(null);


  // ------------------------------------------------------------
  // Custody transfer state
  // ------------------------------------------------------------

  const [transferAddress, setTransferAddress] =
    useState("");

  const [transferState, setTransferState] =
    useState("idle");

  const [transferError, setTransferError] =
    useState(null);

  const [transferTx, setTransferTx] =
    useState(null);

  const [downloading, setDownloading] = useState(false);


  // ------------------------------------------------------------
  // Load evidence + custody history
  // ------------------------------------------------------------

  const load = async () => {
    setError(null);

    try {
      const [
        evidenceRes,
        historyRes
      ] = await Promise.all([
        api.get(`/evidence/${id}`),
        api.get(`/evidence/${id}/history`)
      ]);

      setEvidence(evidenceRes.data);

      setHistory(
        historyRes.data.history || []
      );

    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.error ||
        "Failed to load evidence — you may not be authorized."
      );
    }
  };


  useEffect(() => {
    load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);


  // ------------------------------------------------------------
  // Download / View File from IPFS
  // ------------------------------------------------------------

  const handleDownloadFile = async () => {
    try {
      setDownloading(true);
      setError(null);
      const res = await api.get(`/evidence/${id}/file`, { responseType: "blob" });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = blobUrl;
      const extension = evidence?.fileType?.includes("/") ? evidence.fileType.split("/")[1] : "bin";
      link.setAttribute("download", `evidence-${id}-${evidence?.caseId || "file"}.${extension}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Failed to download file:", err);
      setError(
        err.response?.data?.error ||
        "Failed to download evidence file. You may not be authorized."
      );
    } finally {
      setDownloading(false);
    }
  };


  // ------------------------------------------------------------
  // Verify evidence
  // ------------------------------------------------------------

  const handleVerify = async () => {
    if (!canVerifyEvidence) {
      setError(
        "Your wallet is not authorized to verify evidence."
      );

      return;
    }

    setVerifyState("verifying");
    setError(null);
    setVerifyResult(null);

    try {

      // --------------------------------------------------------
      // Step 1
      // Ask backend to verify evidence against IPFS.
      // --------------------------------------------------------

      const { data } =
        await api.post(
          `/evidence/${id}/verify`
        );


      setVerifyResult(data);


      // --------------------------------------------------------
      // Step 2
      // Record verification permanently on-chain.
      // --------------------------------------------------------

      const contract =
        getContract(true);


      const tx =
        await contract.recordVerification(
          Number(id),
          data.result ===
            "Integrity Verified"
        );


      // --------------------------------------------------------
      // Step 3
      // Wait for blockchain confirmation.
      // --------------------------------------------------------

      await tx.wait();


      // --------------------------------------------------------
      // Step 4
      // Reload evidence and custody history.
      // --------------------------------------------------------

      await load();


      setVerifyResult({
        ...data,
        blockchainTxHash:
          tx.hash,
        blockchainRecorded:
          true
      });


      setVerifyState("done");

    } catch (err) {

      console.error(err);

      setError(
        err.reason ||
        err.response?.data?.error ||
        err.message ||
        "Verification failed"
      );

      setVerifyState("error");
    }
  };


  // ------------------------------------------------------------
  // Transfer custody
  // ------------------------------------------------------------

  const handleTransferCustody =
    async () => {

      if (!canTransferCustody) {
        setTransferError(
          "Your wallet is not authorized to transfer custody."
        );

        return;
      }


      setTransferError(null);
      setTransferTx(null);


      const recipient =
        transferAddress.trim();


      if (!recipient) {
        setTransferError(
          "Enter the recipient wallet address."
        );

        return;
      }


      try {

        setTransferState(
          "confirming"
        );


        // ------------------------------------------------------
        // Get contract connected to current MetaMask account.
        // ------------------------------------------------------

        const contract =
          getContract(true);


        // ------------------------------------------------------
        // Send custody transfer transaction.
        // ------------------------------------------------------

        const tx =
          await contract.transferCustody(
            Number(id),
            recipient
          );


        setTransferState(
          "waiting"
        );


        // ------------------------------------------------------
        // Wait for blockchain confirmation.
        // ------------------------------------------------------

        const receipt =
          await tx.wait();


        setTransferTx(
          receipt.hash
        );


        // ------------------------------------------------------
        // Reload evidence and history.
        // ------------------------------------------------------

        await load();


        setTransferAddress("");

        setTransferState(
          "done"
        );

      } catch (err) {

        console.error(err);

        setTransferError(
          err.reason ||
          err.message ||
          "Custody transfer failed."
        );

        setTransferState(
          "error"
        );
      }
    };


  // ------------------------------------------------------------
  // Loading role
  // ------------------------------------------------------------

  if (roleLoading) {
    return (
      <Layout>
        <div className="text-sm text-slate-600">
          Checking wallet permissions...
        </div>
      </Layout>
    );
  }


  return (
    <Layout>

      <h1 className="text-lg font-semibold text-ocean-900 mb-6">
        Evidence #{id}
      </h1>


      {/* ======================================================
          General error
      ======================================================= */}

      {error && (
        <div className="mb-4 text-sm text-status-danger bg-status-danger/10 border border-status-danger/30 rounded p-3">
          {error}
        </div>
      )}


      {evidence && (

        <div className="grid md:grid-cols-2 gap-6">

          {/* ==================================================
              LEFT COLUMN
          =================================================== */}

          <div className="bg-white border border-ocean-200 rounded-xl p-6 space-y-3 text-sm">


            {/* ------------------------------------------------
                Evidence information
            ------------------------------------------------- */}

            <div className="flex justify-between gap-4">
              <span className="text-slate-500">
                Case ID
              </span>

              <span>
                {evidence.caseId}
              </span>
            </div>


            <div className="flex justify-between gap-4">
              <span className="text-slate-500">
                CID
              </span>

              <span className="break-all text-right">
                {evidence.cid}
              </span>
            </div>


            <div className="flex justify-between gap-4">
              <span className="text-slate-500">
                Type
              </span>

              <span>
                {evidence.fileType}
              </span>
            </div>


            <div className="flex justify-between gap-4">
              <span className="text-slate-500">
                Registered By
              </span>

              <span className="break-all text-right">
                {evidence.registeredBy}
              </span>
            </div>


            <div className="flex justify-between gap-4">
              <span className="text-slate-500">
                Timestamp
              </span>

              <span>
                {new Date(
                  evidence.timestamp * 1000
                ).toLocaleString()}
              </span>
            </div>


            <div className="flex justify-between items-center">

              <span className="text-slate-500">
                Status
              </span>


              <StatusBadge
                tone={
                  evidence.status ===
                  "Verified"
                    ? "success"
                    : evidence.status ===
                      "Flagged"
                    ? "error"
                    : "neutral"
                }
              >
                {evidence.status}
              </StatusBadge>

            </div>


            <p className="text-slate-600 pt-2 border-t border-ocean-200">
              {evidence.description}
            </p>

            <button
              onClick={handleDownloadFile}
              disabled={downloading}
              className="mt-2 w-full py-2 rounded bg-white hover:bg-ocean-100 border border-ocean-300 text-ocean-900 text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>📥</span>
              <span>{downloading ? "Retrieving from IPFS..." : "Download / View Evidence File"}</span>
            </button>


            {/* =================================================
                VERIFY INTEGRITY
            ================================================== */}

           {canVerifyEvidence && (

              <>

                <button
                  onClick={handleVerify}
                  disabled={
                    verifyState ===
                    "verifying"
                  }
                  className="mt-4 w-full py-2 rounded bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-sm text-white"
                >

                  {verifyState ===
                  "verifying"
                    ? "Verifying integrity..."
                    : verifyState ===
                      "done"
                    ? "Verify Again"
                    : "Verify Integrity"}

                </button>


                {verifyResult && (

                  <div
                    className={`mt-2 text-sm rounded p-3 border ${
                      verifyResult.result ===
                      "Integrity Verified"
                        ? "bg-status-ok/10 border-status-ok/30 text-status-ok"
                        : "bg-status-danger/10 border-status-danger/30 text-status-danger"
                    }`}
                  >

                    <div className="font-medium">
                      {verifyResult.result}
                    </div>


                    {verifyResult.blockchainRecorded && (

                      <div className="mt-2">

                        <div className="text-xs text-status-ok">
                          ✓ Verification recorded on blockchain
                        </div>


                        <div className="text-xs text-slate-600 mt-1 break-all">
                          Transaction:{" "}
                          {
                            verifyResult.blockchainTxHash
                          }
                        </div>

                      </div>
                    )}


                    {!verifyResult.blockchainRecorded &&
                      verifyResult.note && (

                        <div className="text-xs text-slate-600 mt-1">
                          {verifyResult.note}
                        </div>

                      )}

                  </div>

                )}

              </>

            )}


            {/* =================================================
                TRANSFER CUSTODY

                IMPORTANT:
                This entire section is rendered ONLY for
                INVESTIGATOR or ADMIN.
            ================================================== */}

            {canTransferCustody && (

              <div className="mt-6 pt-6 border-t border-ocean-200">

                <h2 className="text-sm font-semibold text-ocean-700 mb-2">
                  Transfer Custody
                </h2>


                <p className="text-xs text-slate-500 mb-3">
                  Transfer this evidence to another wallet
                  that has an assigned role.
                </p>


                <input
                  type="text"
                  value={transferAddress}
                  onChange={(e) =>
                    setTransferAddress(
                      e.target.value
                    )
                  }
                  placeholder="Recipient wallet address"
                  className="w-full bg-white border border-ocean-200 rounded px-3 py-2 text-sm"
                />


                <button
                  onClick={
                    handleTransferCustody
                  }
                  disabled={
                    transferState ===
                      "confirming" ||
                    transferState ===
                      "waiting"
                  }
                  className="mt-3 w-full py-2 rounded bg-accent-600 hover:bg-accent-700 disabled:opacity-60 text-sm text-white"
                >

                  {transferState ===
                    "idle" &&
                    "Transfer Custody"}

                  {transferState ===
                    "confirming" &&
                    "Confirm in MetaMask..."}

                  {transferState ===
                    "waiting" &&
                    "Waiting for confirmation..."}

                  {transferState ===
                    "done" &&
                    "Custody Transferred ✓"}

                  {transferState ===
                    "error" &&
                    "Retry Transfer"}

                </button>


                {transferError && (

                  <div className="mt-2 text-sm text-status-danger bg-status-danger/10 border border-status-danger/30 rounded p-3">
                    {transferError}
                  </div>

                )}


                {transferTx && (

                  <div className="mt-2 text-xs text-status-ok bg-status-ok/10 border border-status-ok/30 rounded p-3">

                    <div>
                      ✓ Custody transfer recorded
                      on blockchain
                    </div>

                    <div className="mt-1 break-all text-slate-600">
                      Transaction:{" "}
                      {transferTx}
                    </div>

                  </div>

                )}

              </div>

            )}


            {/* =================================================
                JUDICIARY INFORMATION

                Judiciary does NOT get a transfer form.
            ================================================== */}

            {role === "JUDICIARY" && (

              <div className="mt-6 pt-6 border-t border-ocean-200">

                <div className="rounded-lg border border-ocean-200 bg-white/50 p-3">

                  <div className="text-sm font-medium text-ocean-700">
                    Judiciary Access
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    You can verify the integrity of this
                    evidence and review its chain of custody.
                    Custody transfer is not available to
                    Judiciary users.
                  </div>

                </div>

              </div>

            )}

          </div>


          {/* ==================================================
              RIGHT COLUMN — CHAIN OF CUSTODY
          =================================================== */}

          <div className="bg-white border border-ocean-200 rounded-xl p-6">

            <h2 className="text-sm font-semibold text-ocean-700 mb-4">
              Chain of Custody
            </h2>


            <ol className="relative border-l border-ocean-200 ml-2 space-y-6">

              {history.map(
                (event, idx) => (

                  <li
                    key={idx}
                    className="ml-4"
                  >

                    <div className="absolute -left-[9px] w-4 h-4 rounded-full bg-accent-600 text-white" />


                    <div className="text-sm text-ocean-900">

                      {CUSTODY_ICON[
                        event.action
                      ] || "•"}{" "}

                      {event.action}

                    </div>


                    <div className="text-xs text-slate-500 break-all">
                      {event.actor}
                    </div>


                    <div className="text-xs text-slate-500">
                      {new Date(
                        event.timestamp * 1000
                      ).toLocaleString()}
                    </div>


                    {event.note && (

                      <div className="text-xs text-slate-600 mt-1">
                        {event.note}
                      </div>

                    )}

                  </li>

                )
              )}


              {history.length === 0 && (

                <li className="text-sm text-slate-500 ml-4">
                  No custody events yet.
                </li>

              )}

            </ol>

          </div>

        </div>

      )}

    </Layout>
  );
}