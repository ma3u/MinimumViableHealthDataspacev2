// Renders the MeinBefund app icon into an asset catalogue.
//
// Drawn with CoreGraphics rather than shipped as a binary blob, so the icon is
// reviewable in a diff and regenerates at any size.
//
//   cd clients/ios && swift run IconGen
//
// The mark: a document whose printed lines resolve into one rising trend — the
// product in one image. Paper becomes a series. The upward line is deliberately
// not a "good result"; it is the passage of time, which is what the app adds.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let outputDirectory = URL(fileURLWithPath: "Sources/MeinBefund/Assets.xcassets/AppIcon.appiconset")

// Deep clinical blue → teal. Calm, not alarming: this app reports, it does not warn.
let backgroundTop = CGColor(red: 0.08, green: 0.24, blue: 0.44, alpha: 1)
let backgroundBottom = CGColor(red: 0.05, green: 0.45, blue: 0.50, alpha: 1)
let paper = CGColor(red: 1, green: 1, blue: 1, alpha: 0.96)
let ruleColor = CGColor(red: 0.42, green: 0.52, blue: 0.62, alpha: 0.55)
let trend = CGColor(red: 1.0, green: 0.72, blue: 0.20, alpha: 1)

func drawIcon(size: CGFloat) -> CGImage? {
  let space = CGColorSpaceCreateDeviceRGB()
  guard
    let ctx = CGContext(
      data: nil, width: Int(size), height: Int(size), bitsPerComponent: 8, bytesPerRow: 0,
      space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
  else { return nil }

  let s = size / 1024  // design grid

  // Background gradient.
  let gradient = CGGradient(
    colorsSpace: space, colors: [backgroundTop, backgroundBottom] as CFArray,
    locations: [0, 1])!
  ctx.drawLinearGradient(
    gradient, start: CGPoint(x: 0, y: size), end: CGPoint(x: size, y: 0), options: [])

  // The document: a tall rounded sheet, slightly inset.
  let sheet = CGRect(x: 236 * s, y: 168 * s, width: 552 * s, height: 688 * s)
  let sheetPath = CGPath(
    roundedRect: sheet, cornerWidth: 48 * s, cornerHeight: 48 * s, transform: nil)
  ctx.setShadow(offset: CGSize(width: 0, height: -12 * s), blur: 36 * s,
                color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.35))
  ctx.addPath(sheetPath)
  ctx.setFillColor(paper)
  ctx.fillPath()
  ctx.setShadow(offset: .zero, blur: 0, color: nil)

  // Printed rules — the values on the page, fading as they become a series.
  ctx.setLineCap(.round)
  let ruleLengths: [CGFloat] = [1.0, 0.82, 0.94, 0.68]
  for (index, fraction) in ruleLengths.enumerated() {
    let y = sheet.maxY - (96 + CGFloat(index) * 74) * s
    let alpha = 0.55 - Double(index) * 0.08
    ctx.setStrokeColor(ruleColor.copy(alpha: alpha)!)
    ctx.setLineWidth(26 * s)
    ctx.move(to: CGPoint(x: sheet.minX + 76 * s, y: y))
    ctx.addLine(to: CGPoint(x: sheet.minX + 76 * s + (sheet.width - 152 * s) * fraction, y: y))
    ctx.strokePath()
  }

  // The trend: the rules resolve into one rising line with a marked point.
  let points = [
    CGPoint(x: sheet.minX + 90 * s, y: sheet.minY + 150 * s),
    CGPoint(x: sheet.minX + 210 * s, y: sheet.minY + 232 * s),
    CGPoint(x: sheet.minX + 330 * s, y: sheet.minY + 168 * s),
    CGPoint(x: sheet.maxX - 86 * s, y: sheet.minY + 312 * s),
  ]
  ctx.setStrokeColor(trend)
  ctx.setLineWidth(38 * s)
  ctx.setLineJoin(.round)
  ctx.move(to: points[0])
  for point in points.dropFirst() { ctx.addLine(to: point) }
  ctx.strokePath()

  ctx.setFillColor(trend)
  ctx.fillEllipse(
    in: CGRect(
      x: points.last!.x - 34 * s, y: points.last!.y - 34 * s, width: 68 * s, height: 68 * s))
  ctx.setFillColor(paper)
  ctx.fillEllipse(
    in: CGRect(
      x: points.last!.x - 14 * s, y: points.last!.y - 14 * s, width: 28 * s, height: 28 * s))

  return ctx.makeImage()
}

func write(_ image: CGImage, to url: URL) throws {
  guard
    let destination = CGImageDestinationCreateWithURL(
      url as CFURL, UTType.png.identifier as CFString, 1, nil)
  else { throw NSError(domain: "IconGen", code: 1) }
  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else {
    throw NSError(domain: "IconGen", code: 2)
  }
}

try FileManager.default.createDirectory(
  at: outputDirectory, withIntermediateDirectories: true)

// Xcode 26 single-size app icon, plus a marketing render for App Store Connect.
let sizes: [(name: String, px: CGFloat)] = [("AppIcon-1024", 1024)]
for (name, px) in sizes {
  guard let image = drawIcon(size: px) else { fatalError("render failed at \(px)") }
  try write(image, to: outputDirectory.appendingPathComponent("\(name).png"))
  print("rendered \(name).png (\(Int(px))×\(Int(px)))")
}

let contents = """
{
  "images" : [
    {
      "filename" : "AppIcon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
"""
try contents.write(
  to: outputDirectory.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)

let root = """
{ "info" : { "author" : "xcode", "version" : 1 } }
"""
try root.write(
  to: outputDirectory.deletingLastPathComponent().appendingPathComponent("Contents.json"),
  atomically: true, encoding: .utf8)

print("asset catalogue written to \(outputDirectory.path)")
