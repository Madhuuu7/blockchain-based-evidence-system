const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyUint } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("EvidenceRegistry", function () {
  let contract, admin, officer, investigator, judiciary, outsider;
  const Role = { NONE: 0, ADMIN: 1, OFFICER: 2, INVESTIGATOR: 3, JUDICIARY: 4 };

  beforeEach(async function () {
    [admin, officer, investigator, judiciary, outsider] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("EvidenceRegistry");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  // 1. Deployment
  it("deploys and sets deployer as ADMIN", async function () {
    expect(await contract.getRole(admin.address)).to.equal(Role.ADMIN);
    expect(await contract.deployer()).to.equal(admin.address);
  });

  // 2. Admin role
  it("confirms admin role is queryable", async function () {
    expect(await contract.getRole(admin.address)).to.equal(Role.ADMIN);
  });

  // 3. Role assignment
  it("allows ADMIN to assign roles", async function () {
    await expect(contract.assignRole(officer.address, Role.OFFICER))
      .to.emit(contract, "RoleAssigned")
      .withArgs(officer.address, Role.OFFICER, admin.address, anyUint);
    expect(await contract.getRole(officer.address)).to.equal(Role.OFFICER);
  });

  // 4. Unauthorized role assignment
  it("rejects role assignment from non-admin", async function () {
    await expect(
      contract.connect(officer).assignRole(investigator.address, Role.INVESTIGATOR)
    ).to.be.revertedWith("EvidenceRegistry: caller is not ADMIN");
  });

  describe("with roles assigned", function () {
    beforeEach(async function () {
      await contract.assignRole(officer.address, Role.OFFICER);
      await contract.assignRole(investigator.address, Role.INVESTIGATOR);
      await contract.assignRole(judiciary.address, Role.JUDICIARY);
    });

    // 5. Evidence registration
    it("allows OFFICER to register evidence", async function () {
      await expect(
        contract.connect(officer).registerEvidence("CASE-001", "Qm123CID", "Laptop seized", "disk-image")
      )
        .to.emit(contract, "EvidenceRegistered")
        .withArgs(1, "CASE-001", "Qm123CID", officer.address, anyUint);
    });

    // 6. Unauthorized evidence registration
    it("rejects evidence registration from non-officer", async function () {
      await expect(
        contract.connect(investigator).registerEvidence("CASE-002", "QmABC", "desc", "pdf")
      ).to.be.revertedWith("EvidenceRegistry: incorrect role for this action");
    });

    describe("with evidence registered", function () {
      beforeEach(async function () {
        await contract.connect(officer).registerEvidence("CASE-001", "Qm123CID", "Laptop seized", "disk-image");
      });

      // 7. Evidence retrieval
      it("allows an authorized role to retrieve evidence", async function () {
        const record = await contract.connect(investigator).getEvidence(1);
        expect(record.caseId).to.equal("CASE-001");
        expect(record.cid).to.equal("Qm123CID");
      });

      // 8. Authorized access via attemptAccess
      it("allows authorized attemptAccess and logs AccessEvent", async function () {
        const tx = await contract.connect(judiciary).attemptAccess(1);
        await expect(tx).to.emit(contract, "AccessEvent").withArgs(1, judiciary.address, anyUint);
      });

      // 9. Unauthorized access (getEvidence reverts for NONE role)
      it("reverts getEvidence for a wallet with no role", async function () {
        await expect(contract.connect(outsider).getEvidence(1)).to.be.revertedWith(
          "EvidenceRegistry: caller has no assigned role"
        );
      });

      // 10. AccessDenied event via non-reverting attemptAccess
      it("emits AccessDenied for unauthorized attemptAccess without reverting", async function () {
        await expect(contract.connect(outsider).attemptAccess(1))
          .to.emit(contract, "AccessDenied")
          .withArgs(outsider.address, 1, anyUint, "No role assigned");
      });

      // 11. Chain-of-custody events
      it("records a Registered custody event on registration", async function () {
        const history = await contract.connect(officer).getCustodyHistory(1);
        expect(history.length).to.equal(1);
        expect(history[0].action).to.equal(0); // Registered
      });

      // 12. Evidence transfer
      it("allows INVESTIGATOR to transfer custody to another assigned role", async function () {
        await expect(contract.connect(investigator).transferCustody(1, judiciary.address))
          .to.emit(contract, "TransferEvent")
          .withArgs(1, investigator.address, judiciary.address, anyUint);

        const history = await contract.connect(officer).getCustodyHistory(1);
        expect(history.length).to.equal(2);
        expect(history[1].action).to.equal(2); // Transferred
      });

      it("rejects transfer to a wallet with no assigned role", async function () {
        await expect(
          contract.connect(investigator).transferCustody(1, outsider.address)
        ).to.be.revertedWith("EvidenceRegistry: recipient has no assigned role");
      });

      // 13. Invalid inputs
      it("rejects registration with an empty caseId", async function () {
        await expect(
          contract.connect(officer).registerEvidence("", "QmXYZ", "desc", "pdf")
        ).to.be.revertedWith("EvidenceRegistry: caseId required");
      });

      it("reverts on operations against a non-existent evidence id", async function () {
        await expect(contract.connect(investigator).getEvidence(999)).to.be.revertedWith(
          "EvidenceRegistry: evidence does not exist"
        );
      });

      // 14. Duplicate evidence handling
      it("rejects duplicate evidence for the same case/CID pair", async function () {
        await expect(
          contract.connect(officer).registerEvidence("CASE-001", "Qm123CID", "dup", "disk-image")
        ).to.be.revertedWith("EvidenceRegistry: duplicate evidence for this case/CID");
      });

      // 15. Event parameters — verification result recording
      it("records verification result with correct event parameters", async function () {
        await expect(contract.connect(investigator).recordVerification(1, true))
          .to.emit(contract, "ChainOfCustodyEvent")
          .withArgs(1, 3, investigator.address, anyUint, "Integrity Verified"); // 3 = Verified action

        const record = await contract.connect(investigator).getEvidence(1);
        expect(record.status).to.equal(2); // EvidenceStatus.Verified
      });

      it("records a flagged status on integrity violation", async function () {
        await contract.connect(judiciary).recordVerification(1, false);
        const record = await contract.connect(officer).getEvidence(1);
        expect(record.status).to.equal(3); // EvidenceStatus.Flagged
      });
    });
  });

  it("allows ADMIN to remove a role", async function () {
    await contract.assignRole(officer.address, Role.OFFICER);
    await expect(contract.removeRole(officer.address))
      .to.emit(contract, "RoleRemoved")
      .withArgs(officer.address, Role.OFFICER, admin.address, anyUint);
    expect(await contract.getRole(officer.address)).to.equal(Role.NONE);
  });
});
