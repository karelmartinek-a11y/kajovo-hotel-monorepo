pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "KajovoHotelAndroid"

include(":app")
include(":core:model")
include(":core:common")
include(":core:designsystem")
include(":core:designsystem-tokens")
include(":core:network")
include(":core:session")
include(":core:database")
include(":core:testing")
include(":feature:auth:login")
include(":feature:auth:roles")
include(":feature:profile")
include(":feature:utility")
include(":feature:reception")
include(":feature:housekeeping")
include(":feature:breakfast")
include(":feature:lostfound")
include(":feature:issues")
include(":feature:inventory")

project(":app").projectDir = file("app")
project(":core:model").projectDir = file("core/model")
project(":core:common").projectDir = file("core/common")
project(":core:designsystem").projectDir = file("core/designsystem")
project(":core:designsystem-tokens").projectDir = file("core/designsystem-tokens")
project(":core:network").projectDir = file("core/network")
project(":core:session").projectDir = file("core/session")
project(":core:database").projectDir = file("core/database")
project(":core:testing").projectDir = file("core/testing")
project(":feature:auth:login").projectDir = file("feature/auth/login")
project(":feature:auth:roles").projectDir = file("feature/auth/roles")
project(":feature:profile").projectDir = file("feature/profile")
project(":feature:utility").projectDir = file("feature/utility")
project(":feature:reception").projectDir = file("feature/reception")
project(":feature:housekeeping").projectDir = file("feature/housekeeping")
project(":feature:breakfast").projectDir = file("feature/breakfast")
project(":feature:lostfound").projectDir = file("feature/lostfound")
project(":feature:issues").projectDir = file("feature/issues")
project(":feature:inventory").projectDir = file("feature/inventory")
