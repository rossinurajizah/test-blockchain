const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Pengujian Smart Contract AcademicVerifier", function () {
  let verifier, admin, issuer, student, attacker;
  const docHash = "0x1234567890123456789012345678901234567890123456789012345678901234";

  beforeEach(async function () {
    [admin, issuer, student, attacker] = await ethers.getSigners();
    const AcademicVerifier = await ethers.getContractFactory("AcademicVerifier");
    verifier = await AcademicVerifier.deploy();
  });

  it("T-01: Penerbitan Ijazah Baru oleh Issuer Resmi", async function () {
    await expect(verifier.issueCredential(docHash, student.address))
      .to.emit(verifier, "CredentialIssued")
      .withArgs(docHash, student.address);
  });

  it("T-02: Verifikasi Keaslian Dokumen Aktif", async function () {
    await verifier.issueCredential(docHash, student.address);
    const isValid = await verifier.verifyCredential(docHash);
    expect(isValid).to.equal(true);
  });

  it("T-03: Pencabutan Ijazah dan Verifikasi ulang", async function () {
    await verifier.issueCredential(docHash, student.address);
    await verifier.revokeCredential(docHash);
    const isValid = await verifier.verifyCredential(docHash);
    expect(isValid).to.equal(false);
  });

  it("T-04: Pengujian Akses - Penyerang (Attacker) Gagal Menerbitkan Ijazah", async function () {
    await expect(
      verifier.connect(attacker).issueCredential(docHash, student.address)
    ).to.be.revertedWithCustomError(verifier, "AccessControlUnauthorizedAccount");
  });
});