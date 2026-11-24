// The push data plane (ADR-095). Not an EDC runtime: a plain Java process on
// the Eclipse DataPlane SDK, which gives the Data Plane Signaling messages,
// the data flow state machine and the Postgres stores. The HTTP layer, the two
// token checks and the delivery into the SPE inbox are ours.
dependencies {
    implementation(libs.dataplane.sdk.core)
    implementation(libs.dataplane.sdk.postgresql)
    implementation(libs.jackson3.databind)
    implementation(libs.nimbus.jose.jwt)
    implementation(libs.postgresql)
    implementation(libs.kafka.clients)
    runtimeOnly(libs.slf4j.simple)

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    // the DPS TCK runs as a test (DpsTckTest); it needs the launcher at compile time for its tag filter
    testImplementation(libs.junit.platform.launcher)
    testImplementation(libs.tck.dps)
}

application {
    mainClass.set("eu.mvhd.dataplane.Main")
}

// The image build runs Gradle with -q (runtimes/edc/Dockerfile), which hides
// which test failed; a failure is printed at the quiet level too.
tasks.withType<Test>().configureEach {
    testLogging {
        quiet {
            events("failed")
            exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        }
    }
}
