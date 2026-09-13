import Foundation

/// A small JSON value type with deterministic serialisation.
///
/// `JSONSerialization` is not used for writing because it gives no control over
/// number formatting, and the whole point of this type is that the bytes it
/// produces can be compared against what a TypeScript `JSON.stringify` produced
/// for the same input. Two writers of one wire format only stay in step if
/// their output is comparable.
public enum JSON: Sendable, Equatable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSON])
  case object([(key: String, value: JSON)])

  public static func == (lhs: JSON, rhs: JSON) -> Bool {
    switch (lhs, rhs) {
    case (.null, .null): return true
    case let (.bool(a), .bool(b)): return a == b
    case let (.number(a), .number(b)): return a == b
    case let (.string(a), .string(b)): return a == b
    case let (.array(a), .array(b)): return a == b
    case let (.object(a), .object(b)):
      // Key order is a serialisation detail, not a difference in the document.
      guard a.count == b.count else { return false }
      let left = Dictionary(uniqueKeysWithValues: a.map { ($0.key, $0.value) })
      let right = Dictionary(uniqueKeysWithValues: b.map { ($0.key, $0.value) })
      return left == right
    default: return false
    }
  }

  public var stringValue: String? {
    if case let .string(value) = self { return value }
    return nil
  }

  public subscript(key: String) -> JSON? {
    get {
      guard case let .object(pairs) = self else { return nil }
      return pairs.first { $0.key == key }?.value
    }
    set {
      guard case var .object(pairs) = self else { return }
      if let index = pairs.firstIndex(where: { $0.key == key }) {
        if let newValue { pairs[index].value = newValue } else { pairs.remove(at: index) }
      } else if let newValue {
        pairs.append((key: key, value: newValue))
      }
      self = .object(pairs)
    }
  }

  /// Canonical JSON: keys sorted, no insignificant whitespace.
  ///
  /// Sorting rather than preserving insertion order, so a writer that builds the
  /// same document in a different order still compares equal. What is being
  /// pinned is the document, not the order somebody happened to append fields.
  public func canonical() -> String {
    switch self {
    case .null: return "null"
    case let .bool(value): return value ? "true" : "false"
    case let .number(value): return Self.formatNumber(value)
    case let .string(value): return Self.quote(value)
    case let .array(items): return "[" + items.map { $0.canonical() }.joined(separator: ",") + "]"
    case let .object(pairs):
      let body = pairs
        .sorted { $0.key < $1.key }
        .map { Self.quote($0.key) + ":" + $0.value.canonical() }
        .joined(separator: ",")
      return "{" + body + "}"
    }
  }

  /// Matches JavaScript's `JSON.stringify` for the values a FHIR bundle holds:
  /// an integral double prints without a fractional part, everything else uses
  /// the shortest representation that round-trips.
  static func formatNumber(_ value: Double) -> String {
    if value.isNaN || value.isInfinite { return "null" }
    if value == value.rounded() && abs(value) < 1e15 {
      return String(Int64(value))
    }
    return String(value)
  }

  static func quote(_ raw: String) -> String {
    var out = "\""
    for character in raw.unicodeScalars {
      switch character {
      case "\"": out += "\\\""
      case "\\": out += "\\\\"
      case "\n": out += "\\n"
      case "\r": out += "\\r"
      case "\t": out += "\\t"
      default:
        if character.value < 0x20 {
          out += String(format: "\\u%04x", character.value)
        } else {
          out.unicodeScalars.append(character)
        }
      }
    }
    return out + "\""
  }

  /// Parses JSON text into this representation, for comparing against a fixture.
  public static func parse(_ text: String) throws -> JSON {
    let object = try JSONSerialization.jsonObject(
      with: Data(text.utf8), options: [.fragmentsAllowed])
    return convert(object)
  }

  private static func convert(_ value: Any) -> JSON {
    switch value {
    case is NSNull: return .null
    case let number as NSNumber:
      // NSNumber does not distinguish Bool from 0 and 1 by type alone.
      if CFGetTypeID(number) == CFBooleanGetTypeID() { return .bool(number.boolValue) }
      return .number(number.doubleValue)
    case let string as String: return .string(string)
    case let array as [Any]: return .array(array.map(convert))
    case let dictionary as [String: Any]:
      return .object(dictionary.keys.sorted().map { (key: $0, value: convert(dictionary[$0]!)) })
    default: return .null
    }
  }
}

extension JSON: ExpressibleByStringLiteral {
  public init(stringLiteral value: String) { self = .string(value) }
}

extension JSON: ExpressibleByIntegerLiteral {
  public init(integerLiteral value: Int) { self = .number(Double(value)) }
}

extension JSON: ExpressibleByFloatLiteral {
  public init(floatLiteral value: Double) { self = .number(value) }
}

extension JSON: ExpressibleByBooleanLiteral {
  public init(booleanLiteral value: Bool) { self = .bool(value) }
}

extension JSON: ExpressibleByArrayLiteral {
  public init(arrayLiteral elements: JSON...) { self = .array(elements) }
}

extension JSON: ExpressibleByDictionaryLiteral {
  public init(dictionaryLiteral elements: (String, JSON)...) {
    self = .object(elements.map { (key: $0.0, value: $0.1) })
  }
}
