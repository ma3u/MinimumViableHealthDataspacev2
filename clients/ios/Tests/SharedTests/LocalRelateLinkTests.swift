import Foundation
import Testing

@testable import Shared

@Suite("Export to a local Relate graph: the QR link")
struct LocalRelateLinkTests {
  let fp = String(repeating: "ab", count: 32)
  let token = String(repeating: "test-token-", count: 4)  // obviously fake, 44 chars

  func link(url: String = "https%3A%2F%2F192.168.178.20%3A8787", fp: String? = nil, token: String? = nil)
    -> String
  {
    "klarbefund://relate?url=\(url)&token=\(token ?? self.token)&fp=\(fp ?? self.fp)&name=my-mac&store=health.rl"
  }

  @Test func parsesTheReceiversLink() throws {
    let l = try LocalRelateLink.parse(link())
    #expect(l.url.absoluteString == "https://192.168.178.20:8787")
    #expect(l.fingerprint == fp)
    #expect(l.name == "my-mac")
    #expect(l.store == "health.rl")
    #expect(l.recordEndpoint.absoluteString == "https://192.168.178.20:8787/v1/record")
  }

  @Test func refusesClearText() {
    #expect(throws: LocalRelateLink.Problem.notHTTPS) {
      try LocalRelateLink.parse(link(url: "http%3A%2F%2F192.168.178.20%3A8787"))
    }
  }

  @Test func refusesAnythingOutsideTheHomeNetwork() {
    #expect(throws: LocalRelateLink.Problem.notLocal("ehds.mabu.red")) {
      try LocalRelateLink.parse(link(url: "https%3A%2F%2Fehds.mabu.red"))
    }
    #expect(throws: LocalRelateLink.Problem.notLocal("8.8.8.8")) {
      try LocalRelateLink.parse(link(url: "https%3A%2F%2F8.8.8.8%3A8787"))
    }
  }

  @Test func acceptsLocalAddresses() {
    for host in ["10.0.0.5", "172.20.1.1", "192.168.0.2", "127.0.0.1", "my-mac.local", "fd00::1"] {
      #expect(LocalRelateLink.isLocal(host), "\(host)")
    }
    for host in ["172.32.0.1", "11.0.0.1", "example.com"] {
      #expect(!LocalRelateLink.isLocal(host), "\(host)")
    }
  }

  @Test func refusesABadFingerprintOrAShortToken() {
    #expect(throws: LocalRelateLink.Problem.badFingerprint) {
      try LocalRelateLink.parse(link(fp: "abc"))
    }
    #expect(throws: LocalRelateLink.Problem.weakToken) {
      try LocalRelateLink.parse(link(token: "short"))
    }
  }

  @Test func refusesTheEHDSConnectLink() {
    #expect(throws: LocalRelateLink.Problem.notARelateLink) {
      try LocalRelateLink.parse("klarbefund://connect?ehds=x")
    }
  }

  @Test func pinComparesTheCertificateDigest() {
    let der = Data("certificate".utf8)
    let digest = CertificatePin.fingerprint(of: der)
    #expect(digest.count == 64)
    #expect(CertificatePin.matches(der: der, fingerprint: digest.uppercased()))
    #expect(!CertificatePin.matches(der: Data("other".utf8), fingerprint: digest))
  }
}
