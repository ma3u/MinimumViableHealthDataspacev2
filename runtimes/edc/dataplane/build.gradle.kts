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
    testRuntimeOnly(libs.junit.platform.launcher)
}

application {
    mainClass.set("eu.mvhd.dataplane.Main")
}
