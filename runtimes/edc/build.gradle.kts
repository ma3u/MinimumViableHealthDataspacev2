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

    tasks.named<com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar>("shadowJar") {
        mergeServiceFiles()
        archiveFileName.set("${project.name}.jar")
        duplicatesStrategy = DuplicatesStrategy.INCLUDE
    }
}
