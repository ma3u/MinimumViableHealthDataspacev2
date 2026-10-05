import Foundation
import Testing

@testable import Shared

/// The app's half of ADR-054: reading the hub's answer, and the bytes App
/// Attest signs. Every account here is invented.
@Suite("An account the app creates on the hub")
struct EHDSAccountTests {
  let live = TrustedHub.production

  private func answer(issuer: String = "https://auth.ehds.mabu.red/realms/edcv") -> Data {
    Data(
      """
      {"username":"kb-ab3dk7mn","password":"Abcde-Fghjk-Mnpqr-Stuvw","patientId":"KB-AB3DK7MN",
       "ehds":"https://ehds.mabu.red","issuer":"\(issuer)","client":"klarbefund-account"}
      """.utf8)
  }

  @Test("the hub's answer becomes an account the app created")
  func created() throws {
    let account = try EHDSAccount.created(from: answer(), trusted: live)
    #expect(account.username == "kb-ab3dk7mn")
    #expect(account.createdByApp)
    #expect(account.client == "klarbefund-account")
    #expect(account.passwordGrant["grant_type"] == "password")
    #expect(account.passwordGrant["client_id"] == "klarbefund-account")
  }

  @Test("an answer naming another issuer is refused, so the password goes nowhere else")
  func untrusted() {
    #expect(throws: EHDSAccount.Problem.untrustedHub("evil.example")) {
      try EHDSAccount.created(
        from: answer(issuer: "https://evil.example/realms/edcv"), trusted: live)
    }
  }

  @Test("an incomplete answer is refused")
  func incomplete() {
    #expect(throws: EHDSAccount.Problem.incomplete) {
      try EHDSAccount.created(from: Data(#"{"username":"kb-ab3dk7mn"}"#.utf8), trusted: live)
    }
  }

  @Test("the attested hash is SHA-256 of challenge|deviceId, as the hub computes it")
  func clientDataHash() {
    let hash = EHDSAccount.clientDataHash(
      challenge: "1.abc.def", deviceId: "6f1c2b7e-3d4a-4b5c-9d8e-1a2b3c4d5e6f")
    #expect(hash.map { String(format: "%02x", $0) }.joined() == "c60a7b1f095a044f51f4c8346a3148f50d0b5afd6fa5c042e9ee61e018d50c42")
  }

  @Test("a password travels only over https, or to the Mac's own localhost")
  func encrypted() {
    func account(_ ehds: String, _ issuer: String) -> EHDSAccount {
      EHDSAccount(ehds: ehds, issuer: issuer, username: "kb-ab3dk7mn", password: "x", createdByApp: true)
    }
    #expect(account("https://ehds.mabu.red", "https://auth.ehds.mabu.red/realms/edcv").travelsEncrypted)
    #expect(account("http://localhost:3000", "http://localhost:8080/realms/edcv").travelsEncrypted)
    #expect(!account("http://ehds.mabu.red", "https://auth.ehds.mabu.red/realms/edcv").travelsEncrypted)
    #expect(!account("https://ehds.mabu.red", "http://192.168.1.5:8080/realms/edcv").travelsEncrypted)
  }
}
