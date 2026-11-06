dependencies {
    // for the "manufacturer" attestation our seeds define (see the extension's comment)
    implementation(libs.edc.issuance.spi)

    runtimeOnly(libs.edc.bom.issuerservice)
    runtimeOnly(libs.edc.bom.issuerservice.sql)
    runtimeOnly(libs.edc.ih.api.did)
    runtimeOnly(libs.edc.ih.api.participants)
    runtimeOnly(libs.edc.participantcontext.config)
    runtimeOnly(libs.edc.participantcontext.config.sql)
    runtimeOnly(libs.edc.vault.hashicorp)
    runtimeOnly(libs.edc.monitor.console)
    runtimeOnly(libs.edc.monitor.otel)
    runtimeOnly(libs.edc.events.nats)
    runtimeOnly(libs.opentelemetry.exporter.otlp)
}
