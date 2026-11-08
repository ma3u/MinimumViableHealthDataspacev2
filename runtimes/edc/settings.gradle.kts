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
