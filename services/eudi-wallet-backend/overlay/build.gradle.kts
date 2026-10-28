// Authored for this project — see settings.gradle.kts for why.
//
// The dependency set is derived from two sources and nothing else:
//   * gradle/libs.versions.toml, which upstream does publish, and
//   * the external import roots actually referenced by src/main/kotlin.
// Anything the catalog declares but the source never imports is left out, so
// this stays a faithful build of the published code rather than a superset.

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.spring)
    alias(libs.plugins.serialization)
    alias(libs.plugins.spring.boot)
    alias(libs.plugins.spring.dependency.management)
}

group = "de.eudiwallet"
version = providers.gradleProperty("walletBackendVersion").getOrElse("0.0.0-oss")

kotlin {
    jvmToolchain(libs.versions.java.get().toInt())
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
}

repositories {
    mavenCentral()
}

// The published tree is `src/main/kotlin` only — no resources, no build files.
// Everything this project has to supply lives in the overlay and is compiled
// alongside it rather than copied into the vendored checkout, so the vendored
// checkout stays a verbatim mirror (ADR-005).
val overlayDir: String =
    providers.gradleProperty("walletBackendOverlay").getOrElse("$rootDir/overlay")

sourceSets.named("main") {
    kotlin.srcDir("$overlayDir/src/main/kotlin")
    resources.srcDir("$overlayDir/src/main/resources")
}

// warden-makoto 1.1.3 pulls at.asitplus.signum:indispensable 3.26.0, which
// compiles against kotlinx-coroutines 1.11.0 and calls BuildersKt.runBlockingK.
// Spring Boot 4.1.1's BOM pins coroutines to 1.10.2 and the BOM pin wins over
// the transitive requirement, so the context fails at runtime with
// NoSuchMethodError while building the `makoto` bean. Raise the managed version
// to what indispensable actually needs.
extra["kotlin-coroutines.version"] = "1.11.0"

dependencies {
    implementation(platform(libs.jackson.bom))
    implementation(platform(libs.opentelemetry.instrumentation.bom))
    implementation(platform(libs.aws.sdk.bom))

    // Spring Boot 4 starters (module names differ from Boot 3 — webclient,
    // flyway and kafka are their own starters here).
    implementation(libs.spring.boot.starter.actuator)
    implementation(libs.spring.boot.starter.webflux)
    implementation(libs.spring.boot.starter.webclient)
    implementation(libs.spring.boot.starter.security)
    implementation(libs.spring.boot.starter.data.r2dbc)
    implementation(libs.spring.boot.starter.validation)
    implementation(libs.spring.boot.starter.flyway)
    implementation(libs.spring.boot.kafka)

    // r2dbc-postgresql is compile-time, not runtime-only: shared/json exposes
    // io.r2dbc.postgresql.codec.Json in the signature of toPostgresJson().
    implementation(libs.r2dbc.postgresql)
    runtimeOnly(libs.postgresql)
    runtimeOnly(libs.flyway.postgresql)

    implementation(libs.jackson.module.kotlin)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.reactor)
    implementation(libs.kotlin.logging)
    implementation(libs.kotlin.reflect)

    // JOSE / X.509 / attestation — the crypto surface of WPB, RWSCA and MDVM.
    implementation(libs.nimbus.jose.jwt)
    implementation(libs.bouncycastle.pkix.jdk18)
    implementation(libs.warden.makoto)
    implementation(libs.authlete.http.message.signatures)
    implementation(libs.ngengine.bech32)

    implementation(libs.springdoc.openapi.starter.webflux.ui)

    implementation(libs.opentelemetry.spring.boot.starter)
    implementation(libs.opentelemetry.extension.kotlin)
    implementation(libs.opentelemetry.samplers)
    implementation(libs.logstash.logback.encoder)

    // PNS (FCM) and the S3-backed status list storage.
    implementation(libs.google.auth.library.oauth2.http)
    implementation(libs.aws.sdk.s3)
    implementation(libs.aws.sdk.url.connection.client)

    implementation(libs.vdurmont.semver4j)
}

// TelemetryResponseHeaderFilter injects Spring Boot's GitProperties and puts
// gitProperties.shortCommitId in the X-Service-Version response header, so the
// context does not start without a `git.properties` on the classpath. Upstream's
// build evidently generates one; the mirror publishes neither the build file nor
// the result, so generate it here from the mirror's own checkout.
val gitPropertiesDir = layout.buildDirectory.dir("generated-resources/git")

val generateGitProperties = tasks.register("generateGitProperties") {
    val outputDir = gitPropertiesDir
    val checkoutDir = rootDir
    val projectVersion = version.toString()
    outputs.dir(outputDir)
    outputs.upToDateWhen { false }
    doLast {
        // Project.exec is gone in Gradle 9, so shell out directly.
        fun git(vararg args: String): String =
            runCatching {
                val process =
                    ProcessBuilder(listOf("git", "-C", checkoutDir.absolutePath) + args)
                        .redirectErrorStream(false)
                        .start()
                val out = process.inputStream.bufferedReader().readText().trim()
                process.waitFor()
                if (process.exitValue() == 0) out else ""
            }.getOrDefault("")

        val commit = git("rev-parse", "HEAD").ifBlank { "unknown" }
        val file = outputDir.get().file("git.properties").asFile
        file.parentFile.mkdirs()
        file.writeText(
            listOf(
                "git.commit.id=$commit",
                "git.commit.id.abbrev=" + commit.take(7),
                "git.branch=" + git("rev-parse", "--abbrev-ref", "HEAD").ifBlank { "unknown" },
                "git.commit.time=" + git("show", "-s", "--format=%cI", "HEAD"),
                "git.build.version=$projectVersion",
            ).joinToString("\n", postfix = "\n"),
        )
    }
}

sourceSets.named("main") { resources.srcDir(gitPropertiesDir) }
tasks.named("processResources") { dependsOn(generateGitProperties) }

// Each of WPB, RWSCA, MDVM and PNS has its own entry point; the combined
// application runs all of them and is what this project deploys.
springBoot {
    mainClass.set(
        providers.gradleProperty("walletBackendMainClass")
            .getOrElse("de.eudiwallet.backend.WalletBackendApplicationKt"),
    )
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
}
