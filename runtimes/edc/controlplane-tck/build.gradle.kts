// The control plane as the official DSP TCK sees it (#711): the same virtual
// control plane and EHDS policy vocabulary as :controlplane, with EDC's own
// connector-under-test pieces in place of DCP. EDC builds its TCK connector
// the same way (system-tests/tck/dsp-tck-virtual-connector-under-test):
// iam-mock answers every token, and tasks-tck-extension seeds the TCK's offers
// and agreements and opens the /tck endpoint the TCK uses to start a
// negotiation or a transfer. Never deployed; docker-compose.tck.yml only.
dependencies {
    // the hub's own extension, without :controlplane's DCP and Vault modules
    implementation(project(":controlplane")) { isTransitive = false }
    implementation(libs.edc.spi.controlplane)
    // EhdsAttestedPurposeExtension names the DCP scope extractor registry; without
    // DCP it is absent and the extension binds the provider's check only
    implementation(libs.edc.spi.dcp)

    runtimeOnly(libs.edc.bom.controlplane.virtual) {
        // as EDC's TCK connector: no data plane signalling to authorise
        exclude("org.eclipse.edc", "data-plane-signaling")
        exclude("org.eclipse.edc", "data-plane-signaling-oauth2")
        exclude("org.eclipse.edc", "data-plane-signaling-oauth2-token-exchange")
    }
    runtimeOnly(libs.edc.bom.controlplane.virtual.sql)
    runtimeOnly(libs.edc.bom.controlplane.virtual.nats)
    runtimeOnly(libs.edc.iam.mock)
    runtimeOnly(libs.edc.tck.tasks)
    runtimeOnly(libs.edc.monitor.console)
    runtimeOnly(libs.bouncyCastle.bcprov)
}
