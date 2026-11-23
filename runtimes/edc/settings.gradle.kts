rootProject.name = "mvhd-edc-runtimes"

dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

include(":controlplane")
include(":controlplane-tck")
include(":identity-hub")
include(":issuerservice")
// not an EDC runtime: the push data plane on the Eclipse DataPlane SDK (ADR-095)
include(":dataplane")
