import groovy.json.JsonSlurper
import org.gradle.api.GradleException

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

data class AndroidReleaseManifest(
    val versionCode: Int,
    val versionName: String,
    val downloadUrl: String,
    val sha256: String,
)

val androidReleaseManifest = run {
    val manifestFile = rootDir.resolve("release/android-release.json")
    check(manifestFile.exists()) { "Chybi Android release manifest: ${manifestFile.absolutePath}" }
    val payload = JsonSlurper().parseText(manifestFile.readText(Charsets.UTF_8)) as Map<*, *>
    AndroidReleaseManifest(
        versionCode = (payload["version_code"] as Number).toInt(),
        versionName = payload["version_name"].toString(),
        downloadUrl = payload["download_url"].toString(),
        sha256 = payload["sha256"].toString(),
    )
}

val uploadStoreFileProvider = providers.gradleProperty("KAJOVO_UPLOAD_STORE_FILE")
    .orElse(providers.environmentVariable("KAJOVO_UPLOAD_STORE_FILE"))
val uploadStorePasswordProvider = providers.gradleProperty("KAJOVO_UPLOAD_STORE_PASSWORD")
    .orElse(providers.environmentVariable("KAJOVO_UPLOAD_STORE_PASSWORD"))
val uploadKeyAliasProvider = providers.gradleProperty("KAJOVO_UPLOAD_KEY_ALIAS")
    .orElse(providers.environmentVariable("KAJOVO_UPLOAD_KEY_ALIAS"))
val uploadKeyPasswordProvider = providers.gradleProperty("KAJOVO_UPLOAD_KEY_PASSWORD")
    .orElse(providers.environmentVariable("KAJOVO_UPLOAD_KEY_PASSWORD"))

val hasReleaseSigning = uploadStoreFileProvider.isPresent &&
    uploadStorePasswordProvider.isPresent &&
    uploadKeyAliasProvider.isPresent &&
    uploadKeyPasswordProvider.isPresent

android {
    namespace = "cz.hcasc.kajovohotel.app"
    compileSdk = libs.versions.compileSdk.get().toInt()

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(uploadStoreFileProvider.get())
                storePassword = uploadStorePasswordProvider.get()
                keyAlias = uploadKeyAliasProvider.get()
                keyPassword = uploadKeyPasswordProvider.get()
            }
        }
    }

    defaultConfig {
        applicationId = "cz.hcasc.kajovohotel.app"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = androidReleaseManifest.versionCode
        versionName = androidReleaseManifest.versionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables.useSupportLibrary = true
        buildConfigField("String", "HOTEL_BASE_URL", "\"${providers.gradleProperty("kajovoHotelBaseUrl").orElse("https://hotel.hcasc.cz").get()}\"")
        buildConfigField("String", "ANDROID_RELEASE_DOWNLOAD_URL", "\"${androidReleaseManifest.downloadUrl}\"")
        buildConfigField("String", "ANDROID_RELEASE_SHA256", "\"${androidReleaseManifest.sha256}\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }

    buildTypes {
        getByName("release") {
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

gradle.taskGraph.whenReady {
    val requiresReleaseSigning = allTasks.any { task ->
        val name = task.name.lowercase()
        "release" in name && ("assemble" in name || "bundle" in name || "package" in name)
    }
    if (requiresReleaseSigning && !hasReleaseSigning) {
        throw GradleException(
            "Release build vyzaduje produkcni keystore. Nastav KAJOVO_UPLOAD_STORE_FILE, " +
                "KAJOVO_UPLOAD_STORE_PASSWORD, KAJOVO_UPLOAD_KEY_ALIAS a KAJOVO_UPLOAD_KEY_PASSWORD.",
        )
    }
}

dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:common"))
    implementation(project(":core:designsystem"))
    implementation(project(":core:designsystem-tokens"))
    implementation(project(":core:network"))
    implementation(project(":core:session"))
    implementation(project(":core:database"))
    implementation(project(":feature:auth:login"))
    implementation(project(":feature:auth:roles"))
    implementation(project(":feature:profile"))
    implementation(project(":feature:utility"))
    implementation(project(":feature:reception"))
    implementation(project(":feature:housekeeping"))
    implementation(project(":feature:breakfast"))
    implementation(project(":feature:lostfound"))
    implementation(project(":feature:issues"))
    implementation(project(":feature:inventory"))
    implementation(project(":feature:reports"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.google.material)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(platform(libs.okhttp.bom))
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.retrofit)
    implementation(libs.retrofit.moshi)
    implementation(libs.moshi)
    implementation(libs.moshi.kotlin)
    implementation(libs.hilt.android)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    ksp(libs.hilt.compiler)

    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(project(":core:testing"))
    testImplementation(libs.junit4)
    testImplementation(libs.kotlinx.coroutines.test)

    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
}

kotlin {
    jvmToolchain(17)
}
