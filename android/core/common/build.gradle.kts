plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

val generatedPortalTranslations = layout.buildDirectory.dir("generated/portal-translations")
val syncPortalTranslations = tasks.register<Copy>("syncPortalTranslations") {
    from(rootProject.file("../packages/shared/src/i18n/portal-translations.json"))
    into(generatedPortalTranslations)
}


android {
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        minSdk = libs.versions.minSdk.get().toInt()
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

android {
    namespace = "cz.hcasc.kajovohotel.core.common"
    sourceSets.getByName("main").assets.srcDir(generatedPortalTranslations)
}

tasks.named("preBuild").configure { dependsOn(syncPortalTranslations) }

dependencies {
    implementation(project(":core:model"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlinx.coroutines.android)
}

kotlin {
    jvmToolchain(17)
}
