import Foundation

extension Analytes {

  /// What an analyte measures, in the reader's language.
  ///
  /// The text is generated from the TypeScript dictionary rather than kept in
  /// `Localizable.strings`, because the English sentence is generated too: a
  /// translation stored anywhere else would drift apart from its source the
  /// first time an analyte was added. The generator refuses to emit unless
  /// both languages cover exactly the same analytes, so this lookup cannot
  /// silently fall back to English for a new one.
  ///
  /// Matched on the language code alone. A reader on `de-AT` or `de-CH` wants
  /// the German sentence; the difference between the three is not one this
  /// text makes.
  public static func description(
    of analyteKey: String,
    language: String = Locale.preferredLanguages.first ?? "en"
  ) -> String? {
    let code = Locale(identifier: language).language.languageCode?.identifier ?? "en"
    if code == "de", let german = descriptionsDe[analyteKey] { return german }
    return descriptions[analyteKey]
  }
}
