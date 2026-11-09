// Thin EDC launchers (ADR-076): each subproject only assembles released
// org.eclipse.edc modules into one runnable jar.
plugins {
    java
    alias(libs.plugins.shadow) apply false
}

subprojects {
    apply(plugin = "java")
    apply(plugin = "application")
    apply(plugin = "com.gradleup.shadow")

    java {
        toolchain {
            languageVersion.set(JavaLanguageVersion.of(21))
        }
    }

    configure<JavaApplication> {
        mainClass.set("org.eclipse.edc.boot.system.runtime.BaseRuntime")
    }

    // org.glassfish:jakarta.json 2.0.1 bundles its own copy of the 2.0 API. In
    // the shadow jar it overwrote jakarta.json-api 2.1.3, and serialising any
    // policy with a numeric value failed with NoSuchMethodError
    // Json.createValue(Number), so every provider whose offers carry a number
    // answered DSP catalog requests with 401 (#881, finding 20). Parsson is
    // the implementation EDC uses.
    configurations.all {
        exclude(group = "org.glassfish", module = "jakarta.json")
    }

    // the hub's own extensions have unit tests; the image build runs them
    tasks.withType<Test>().configureEach {
        useJUnitPlatform()
    }

    tasks.named<com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar>("shadowJar") {
        mergeServiceFiles()
        archiveFileName.set("${project.name}.jar")
        duplicatesStrategy = DuplicatesStrategy.INCLUDE
    }
}
