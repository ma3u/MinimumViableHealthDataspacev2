// swift-tools-version: 6.0
import PackageDescription

// Evaluation harness only, see ../README.md. Not shipped, not a product target.
let package = Package(
  name: "fm-extract",
  platforms: [.macOS("26.0")],
  targets: [
    .executableTarget(name: "fm-extract", path: "Sources/fm-extract")
  ]
)
