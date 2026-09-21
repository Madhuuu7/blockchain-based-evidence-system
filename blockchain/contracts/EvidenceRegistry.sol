// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EvidenceRegistry
 * @notice Immutable chain-of-custody and role-authorization layer for a
 *         digital evidence management system. Large files are NEVER stored
 *         here — only IPFS CIDs and metadata. This contract is the final
 *         authority on authorization; the backend/frontend are UX layers only.
 */
contract EvidenceRegistry {
    // ---------------------------------------------------------------------
    // Roles
    // ---------------------------------------------------------------------
    enum Role {
        NONE,
        ADMIN,
        OFFICER,
        INVESTIGATOR,
        JUDICIARY
    }

    address public immutable deployer;
    mapping(address => Role) private roles;

    // ---------------------------------------------------------------------
    // Evidence & Custody
    // ---------------------------------------------------------------------
    struct Evidence {
        uint256 evidenceId;
        string caseId;
        string cid;          // IPFS content identifier
        string description;
        string fileType;
        address registeredBy;
        uint256 timestamp;
        bool exists;
        EvidenceStatus status;
    }

    enum EvidenceStatus {
        Registered,
        UnderReview,
        Verified,
        Flagged
    }

    enum CustodyAction {
        Registered,
        Accessed,
        Transferred,
        Verified
    }

    struct CustodyEvent {
        CustodyAction action;
        address actor;
        uint256 timestamp;
        string note; // e.g. transfer target, verification result
    }

    uint256 private nextEvidenceId = 1;
    mapping(uint256 => Evidence) private evidenceRecords;
    mapping(uint256 => CustodyEvent[]) private custodyHistory;
    // caseId => cid => used, to prevent duplicate evidence for the same case
    mapping(bytes32 => bool) private duplicateGuard;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event RoleAssigned(address indexed account, Role role, address indexed assignedBy, uint256 timestamp);
    event RoleRemoved(address indexed account, Role previousRole, address indexed removedBy, uint256 timestamp);

    event EvidenceRegistered(
        uint256 indexed evidenceId,
        string caseId,
        string cid,
        address indexed registeredBy,
        uint256 timestamp
    );

    event ChainOfCustodyEvent(
        uint256 indexed evidenceId,
        CustodyAction action,
        address indexed actor,
        uint256 timestamp,
        string note
    );

    event AccessEvent(uint256 indexed evidenceId, address indexed accessor, uint256 timestamp);

    event TransferEvent(
        uint256 indexed evidenceId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    // Emitted on a NON-REVERTING authorization check (see attemptAccess below).
    event AccessDenied(address indexed wallet, uint256 indexed evidenceId, uint256 timestamp, string reason);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------
    modifier onlyAdmin() {
        require(roles[msg.sender] == Role.ADMIN, "EvidenceRegistry: caller is not ADMIN");
        _;
    }

    modifier onlyRole(Role required) {
        require(roles[msg.sender] == required, "EvidenceRegistry: incorrect role for this action");
        _;
    }

    modifier evidenceExists(uint256 evidenceId) {
        require(evidenceRecords[evidenceId].exists, "EvidenceRegistry: evidence does not exist");
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor — deployer is bootstrapped as the first ADMIN
    // ---------------------------------------------------------------------
    constructor() {
        deployer = msg.sender;
        roles[msg.sender] = Role.ADMIN;
        emit RoleAssigned(msg.sender, Role.ADMIN, msg.sender, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Role management — ADMIN only
    // ---------------------------------------------------------------------
    function assignRole(address account, Role role) external onlyAdmin {
        require(account != address(0), "EvidenceRegistry: zero address");
        require(role != Role.NONE, "EvidenceRegistry: use removeRole to clear a role");
        roles[account] = role;
        emit RoleAssigned(account, role, msg.sender, block.timestamp);
    }

    function removeRole(address account) external onlyAdmin {
        Role previous = roles[account];
        require(previous != Role.NONE, "EvidenceRegistry: account has no role");
        roles[account] = Role.NONE;
        emit RoleRemoved(account, previous, msg.sender, block.timestamp);
    }

    function getRole(address account) external view returns (Role) {
        return roles[account];
    }

    // ---------------------------------------------------------------------
    // Evidence registration — OFFICER only
    // ---------------------------------------------------------------------
    function registerEvidence(
        string calldata caseId,
        string calldata cid,
        string calldata description,
        string calldata fileType
    ) external onlyRole(Role.OFFICER) returns (uint256) {
        require(bytes(caseId).length > 0, "EvidenceRegistry: caseId required");
        require(bytes(cid).length > 0, "EvidenceRegistry: cid required");

        bytes32 dupKey = keccak256(abi.encodePacked(caseId, cid));
        require(!duplicateGuard[dupKey], "EvidenceRegistry: duplicate evidence for this case/CID");
        duplicateGuard[dupKey] = true;

        uint256 id = nextEvidenceId++;
        evidenceRecords[id] = Evidence({
            evidenceId: id,
            caseId: caseId,
            cid: cid,
            description: description,
            fileType: fileType,
            registeredBy: msg.sender,
            timestamp: block.timestamp,
            exists: true,
            status: EvidenceStatus.Registered
        });

        custodyHistory[id].push(
            CustodyEvent(CustodyAction.Registered, msg.sender, block.timestamp, "Evidence registered")
        );

        emit EvidenceRegistered(id, caseId, cid, msg.sender, block.timestamp);
        emit ChainOfCustodyEvent(id, CustodyAction.Registered, msg.sender, block.timestamp, "Evidence registered");

        return id;
    }

    // ---------------------------------------------------------------------
    // Evidence retrieval — reverts if caller has no valid role (NONE)
    // Defense in depth: this is the "hard" authorization path used by
    // read calls that MUST NOT return data to unauthorized callers.
    // ---------------------------------------------------------------------
    function getEvidence(uint256 evidenceId)
        external
        view
        evidenceExists(evidenceId)
        returns (Evidence memory)
    {
        require(roles[msg.sender] != Role.NONE, "EvidenceRegistry: caller has no assigned role");
        return evidenceRecords[evidenceId];
    }

    /**
     * @notice Non-reverting authorization probe. Any account (including
     *         Role.NONE) can call this. If unauthorized, it emits
     *         AccessDenied and returns (false, empty struct) WITHOUT
     *         reverting — this is what lets the AccessDenied event actually
     *         land on-chain and be picked up by the backend listener, since
     *         a reverted require() would roll back its own event log.
     *         Authorized callers get (true, evidence) and an AccessEvent.
     */
    function attemptAccess(uint256 evidenceId)
        external
        evidenceExists(evidenceId)
        returns (bool authorized, Evidence memory record)
    {
        if (roles[msg.sender] == Role.NONE) {
            emit AccessDenied(msg.sender, evidenceId, block.timestamp, "No role assigned");
            return (false, record); // record left as empty/default struct
        }

        recordAccess(evidenceId);
        return (true, evidenceRecords[evidenceId]);
    }

    // ---------------------------------------------------------------------
    // Access logging — any assigned role may log an access (view)
    // ---------------------------------------------------------------------
    function recordAccess(uint256 evidenceId) public evidenceExists(evidenceId) {
        require(roles[msg.sender] != Role.NONE, "EvidenceRegistry: caller has no assigned role");

        custodyHistory[evidenceId].push(
            CustodyEvent(CustodyAction.Accessed, msg.sender, block.timestamp, "Evidence accessed")
        );

        emit AccessEvent(evidenceId, msg.sender, block.timestamp);
        emit ChainOfCustodyEvent(evidenceId, CustodyAction.Accessed, msg.sender, block.timestamp, "Evidence accessed");
    }

    // ---------------------------------------------------------------------
    // Custody transfer — INVESTIGATOR (or ADMIN) only
    // ---------------------------------------------------------------------
    function transferCustody(uint256 evidenceId, address to)
        external
        evidenceExists(evidenceId)
    {
        require(
            roles[msg.sender] == Role.INVESTIGATOR || roles[msg.sender] == Role.ADMIN,
            "EvidenceRegistry: caller not permitted to transfer custody"
        );
        require(to != address(0), "EvidenceRegistry: zero address");
        require(roles[to] != Role.NONE, "EvidenceRegistry: recipient has no assigned role");

        custodyHistory[evidenceId].push(
            CustodyEvent(CustodyAction.Transferred, msg.sender, block.timestamp, "Custody transferred")
        );

        emit TransferEvent(evidenceId, msg.sender, to, block.timestamp);
        emit ChainOfCustodyEvent(evidenceId, CustodyAction.Transferred, msg.sender, block.timestamp, "Custody transferred");
    }

    // ---------------------------------------------------------------------
    // Verification result logging — INVESTIGATOR or JUDICIARY
    // Actual CID hash comparison happens off-chain (backend); this just
    // records the immutable result of that verification.
    // ---------------------------------------------------------------------
    function recordVerification(uint256 evidenceId, bool integrityVerified)
        external
        evidenceExists(evidenceId)
    {
        require(
            roles[msg.sender] == Role.INVESTIGATOR || roles[msg.sender] == Role.JUDICIARY,
            "EvidenceRegistry: caller not permitted to record verification"
        );

        Evidence storage record = evidenceRecords[evidenceId];
        record.status = integrityVerified ? EvidenceStatus.Verified : EvidenceStatus.Flagged;

        string memory note = integrityVerified ? "Integrity Verified" : "Integrity Violation";

        custodyHistory[evidenceId].push(
            CustodyEvent(CustodyAction.Verified, msg.sender, block.timestamp, note)
        );

        emit ChainOfCustodyEvent(evidenceId, CustodyAction.Verified, msg.sender, block.timestamp, note);
    }

    // ---------------------------------------------------------------------
    // Custody history — reverts for callers with no role (defense in depth)
    // ---------------------------------------------------------------------
    function getCustodyHistory(uint256 evidenceId)
        external
        view
        evidenceExists(evidenceId)
        returns (CustodyEvent[] memory)
    {
        require(roles[msg.sender] != Role.NONE, "EvidenceRegistry: caller has no assigned role");
        return custodyHistory[evidenceId];
    }

    function totalEvidence() external view returns (uint256) {
        return nextEvidenceId - 1;
    }
}
