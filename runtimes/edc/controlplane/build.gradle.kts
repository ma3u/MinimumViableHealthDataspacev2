dependencies {
    // for the EHDS policy vocabulary (see the extension's comment)
    implementation(libs.edc.spi.controlplane)
    // for ehds:attestedPurpose's scope extractor (ADR-090)
    implementation(libs.edc.spi.dcp)
    // for the task streams liveness check (ADR-084)
    implementation(libs.jnats)

    runtimeOnly(libs.edc.bom.controlplane.virtual)
    runtimeOnly(libs.edc.bom.controlplane.virtual.sql)
    runtimeOnly(libs.edc.bom.controlplane.virtual.nats)
    runtimeOnly(libs.edc.bom.controlplane.virtual.dcp)
    runtimeOnly(libs.edc.monitor.console)
    runtimeOnly(libs.edc.monitor.otel)
    runtimeOnly(libs.edc.events.nats)
    runtimeOnly(libs.edc.vault.hashicorp)
    runtimeOnly(libs.bouncyCastle.bcprov)
    runtimeOnly(libs.opentelemetry.exporter.otlp)

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}
