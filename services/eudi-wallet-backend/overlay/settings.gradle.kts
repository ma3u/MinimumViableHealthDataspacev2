// Authored for this project — the published mirror of
// german-national-wallet/de-eudi-wallet-backend ships src/ and
// gradle/libs.versions.toml but no build files ("build instructions are
// coming"). Applied over a pinned upstream clone by scripts/eudi/build-backend.sh.

plugins {
    // The catalog pins java = "25"; provision it rather than demanding a
    // matching JDK on the host (the repo's own toolchain is JDK 21).
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "de-eudi-wallet-backend"
