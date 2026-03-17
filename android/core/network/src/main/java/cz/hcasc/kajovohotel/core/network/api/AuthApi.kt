package cz.hcasc.kajovohotel.core.network.api

import cz.hcasc.kajovohotel.core.network.dto.AuthIdentityDto
import cz.hcasc.kajovohotel.core.network.dto.AndroidReleaseDto
import cz.hcasc.kajovohotel.core.network.dto.AuthProfileDto
import cz.hcasc.kajovohotel.core.network.dto.AuthProfileUpdateRequest
import cz.hcasc.kajovohotel.core.network.dto.PortalLoginRequest
import cz.hcasc.kajovohotel.core.network.dto.PortalPasswordChangeRequest
import cz.hcasc.kajovohotel.core.network.dto.PortalPasswordResetRequest
import cz.hcasc.kajovohotel.core.network.dto.SelectRoleRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST

interface AuthApi {
    @GET("/api/app/android-release") suspend fun androidRelease(): AndroidReleaseDto
    @POST("/api/auth/login") suspend fun login(@Body request: PortalLoginRequest): AuthIdentityDto
    @GET("/api/auth/me") suspend fun me(): AuthIdentityDto
    @POST("/api/auth/select-role") suspend fun selectRole(@Body request: SelectRoleRequest): AuthIdentityDto
    @POST("/api/auth/logout") suspend fun logout(): Response<Unit>
    @GET("/api/auth/profile") suspend fun profile(): AuthProfileDto
    @PATCH("/api/auth/profile") suspend fun updateProfile(@Body request: AuthProfileUpdateRequest): AuthProfileDto
    @POST("/api/auth/change-password") suspend fun changePassword(@Body request: PortalPasswordChangeRequest): Response<Unit>
    @POST("/api/auth/reset-password") suspend fun resetPassword(@Body request: PortalPasswordResetRequest): Response<Unit>
}
