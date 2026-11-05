dependencies {
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
}
