// swift-tools-version: 6.0
import PackageDescription

// The iPhone client (#186). Today it holds the generated analyte table shared
// with services/epa-ingest, and a parity check that the generated Swift agrees
// with the TypeScript it came from. App targets land here as they are written.
let package = Package(
  name: "MVHDClient",
  platforms: [.macOS("26.0"), .iOS("26.0")],
  products: [
    .library(name: "Shared", targets: ["Shared"])
  ],
  targets: [
    .target(name: "Shared", path: "Sources/Shared"),
    .executableTarget(name: "AnalyteParity", dependencies: ["Shared"], path: "Tools/AnalyteParity"),
    .testTarget(name: "SharedTests", dependencies: ["Shared"], path: "Tests/SharedTests"),
    .executableTarget(name: "IconGen", path: "Tools/IconGen"),
  ]
)
