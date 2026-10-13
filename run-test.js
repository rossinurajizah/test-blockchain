// Pengujian nyata AcademicVerifier di jaringan Hardhat in-process (EVM sungguhan).
import hre from "hardhat";
import { ethers } from "ethers";

const results = [];
async function check(id, desc, fn) {
  try {
    const detail = await fn();
    results.push({ id, ok: true });
    console.log(`[${id}] ${desc} ... LULUS ${detail ? "(" + detail + ")" : ""}`);
  } catch (e) {
    results.push({ id, ok: false });
    console.log(`[${id}] ${desc} ... GAGAL (${e.message})`);
  }
}
// Pastikan transaksi benar-benar revert dengan pesan/error yang diharapkan.
async function expectRevert(promise, expected, iface) {
  try { await promise; } catch (e) {
    let decoded = "";
    const data = e.data || (e.info && e.info.error && e.info.error.data);
    if (iface && typeof data === "string") { const pe = iface.parseError(data); if (pe) decoded = pe.name + "(" + pe.args.join(",") + ")"; }
    const text = [decoded, e.message, e.reason, e.revert && e.revert.name, e.shortMessage].join(" | ");
    if (text.includes(expected)) return decoded || expected;
    throw new Error(`revert tidak sesuai, diharapkan "${expected}", dapat: ${text.slice(0, 160)}`);
  }
  throw new Error("transaksi seharusnya revert tetapi berhasil");
}

async function main() {
  // Hardhat 3: sambungkan ke jaringan EDR in-process (EVM sungguhan). Jalankan `npx hardhat build` lebih dulu.
  const conn = await hre.network.connect();
  const provider = new ethers.BrowserProvider(conn.provider);
  const net = await provider.getNetwork();
  const [admin, issuer, student, attacker] = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i)));
  console.log("Chain ID:", net.chainId.toString());
  console.log("Admin:", admin.address, "\nIssuer:", issuer.address, "\nStudent:", student.address, "\nAttacker:", attacker.address, "\n");

  const art = await hre.artifacts.readArtifact("AcademicVerifier");
  const factory = new ethers.ContractFactory(art.abi, art.bytecode, admin);
  const c = await factory.deploy();
  const dRcpt = await c.deploymentTransaction().wait();
  console.log("Deploy: alamat", await c.getAddress(), "| blok", dRcpt.blockNumber, "| gas", dRcpt.gasUsed.toString(), "\n");

  const ISSUER_ROLE = await c.ISSUER_ROLE();
  await (await c.grantRole(ISSUER_ROLE, issuer.address)).wait();
  const docHash = ethers.keccak256(ethers.toUtf8Bytes("ijazah-sintetis-001"));

  await check("T-01", "issueCredential() oleh Issuer", async () => {
    const rc = await (await c.connect(issuer).issueCredential(docHash, student.address)).wait();
    if (rc.status !== 1) throw new Error("status transaksi != 1");
    const ev = rc.logs.map((l) => c.interface.parseLog(l)).find((l) => l && l.name === "CredentialIssued");
    if (!ev || ev.args.docHash !== docHash || ev.args.student !== student.address) throw new Error("event CredentialIssued tidak sesuai");
    const cred = await c.credentials(docHash);
    if (!cred.isValid || cred.studentWallet !== student.address) throw new Error("state kredensial salah");
    return `Tx ${rc.hash.slice(0, 18)}..., gas ${rc.gasUsed}`;
  });
  await check("T-02", "verifyCredential() pada hash aktif (dipanggil akun Attacker)", async () => {
    const v = await c.connect(attacker).verifyCredential(docHash);
    if (v !== true) throw new Error(`mengembalikan ${v}`);
    return `return=${v}`;
  });
  await check("T-03", "revokeCredential() oleh Admin, lalu verifikasi ulang", async () => {
    const rc = await (await c.connect(admin).revokeCredential(docHash)).wait();
    const ev = rc.logs.map((l) => c.interface.parseLog(l)).find((l) => l && l.name === "CredentialRevoked");
    if (!ev) throw new Error("event CredentialRevoked tidak ada");
    const v = await c.verifyCredential(docHash);
    if (v !== false) throw new Error("kredensial masih valid setelah dicabut");
    return `Tx ${rc.hash.slice(0, 18)}..., verify=${v}`;
  });
  await check("T-04", "Attacker memanggil issueCredential() (harus revert)", () =>
    expectRevert(c.connect(attacker).issueCredential(ethers.keccak256(ethers.toUtf8Bytes("palsu")), attacker.address), "AccessControlUnauthorizedAccount", c.interface));
  await check("T-05", "Issue hash yang sama dua kali (harus revert)", () =>
    expectRevert(c.connect(issuer).issueCredential(docHash, student.address), "Kredensial sudah terdaftar"));
  await check("T-06", "verifyCredential() pada hash tidak terdaftar", async () => {
    const u = await c.verifyCredential(ethers.keccak256(ethers.toUtf8Bytes("tidak-ada")));
    if (u !== false) throw new Error(`mengembalikan ${u}`);
    return `return=${u}`;
  });
  await check("T-07", "revokeCredential() pada hash tidak terdaftar (harus revert)", () =>
    expectRevert(c.connect(admin).revokeCredential(ethers.keccak256(ethers.toUtf8Bytes("x"))), "Kredensial tidak ditemukan"));
  await check("T-08", "Non-admin memanggil revokeCredential() (harus revert)", () =>
    expectRevert(c.connect(issuer).revokeCredential(docHash), "AccessControlUnauthorizedAccount", c.interface));
  await check("T-09", "Non-admin memanggil grantRole() (revert; peran tidak berubah)", async () => {
    const r = await expectRevert(c.connect(attacker).grantRole(ISSUER_ROLE, attacker.address), "AccessControlUnauthorizedAccount", c.interface);
    if (await c.hasRole(ISSUER_ROLE, attacker.address)) throw new Error("peran Attacker berubah");
    return r.slice(0, 40) + "...; hasRole=false";
  });
  await check("T-10", "Issue ulang hash yang sudah dicabut (revert; status tetap tidak valid)", async () => {
    const r = await expectRevert(c.connect(issuer).issueCredential(docHash, student.address), "Kredensial sudah terdaftar");
    if ((await c.verifyCredential(docHash)) !== false) throw new Error("status berubah menjadi valid");
    return r + "; verify=false";
  });
  
  const pass = results.filter((r) => r.ok).length;
  console.log(`\nHASIL: ${pass}/${results.length} lulus`);
  if (pass !== results.length) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });