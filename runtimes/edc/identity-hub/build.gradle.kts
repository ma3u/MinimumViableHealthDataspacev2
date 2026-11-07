dependencies {
    runtimeOnly(libs.edc.bom.identityhub)
    runtimeOnly(libs.edc.bom.identityhub.sql)
    runtimeOnly(libs.edc.participantcontext.config)
    runtimeOnly(libs.edc.participantcontext.config.sql)
    runtimeOnly(libs.edc.vault.hashicorp)
    runtimeOnly(libs.edc.monitor.console)
    runtimeOnly(libs.edc.monitor.otel)
    runtimeOnly(libs.edc.events.nats)
    runtimeOnly(libs.opentelemetry.exporter.otlp)
}
