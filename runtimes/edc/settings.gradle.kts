rootProject.name = "mvhd-edc-runtimes"

dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

include(":controlplane")
include(":identity-hub")
include(":issuerservice")
