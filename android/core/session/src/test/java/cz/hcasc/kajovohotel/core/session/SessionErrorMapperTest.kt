package cz.hcasc.kajovohotel.core.session

import cz.hcasc.kajovohotel.core.model.BlockingUtilityState
import java.io.IOException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class SessionErrorMapperTest {
    @Test
    fun `maps offline IO error to offline utility state`() {
        val resolution = SessionErrorMapper.resolve(IOException("offline"), "fallback")

        assertEquals("Síť není dostupná. Zkontrolujte připojení a opakujte akci.", resolution.message)
        assertEquals(BlockingUtilityState.OFFLINE, resolution.utilityState)
        assertFalse(resolution.clearLocalSession)
    }

    @Test
    fun `maps 401 to local session clear`() {
        val resolution = SessionErrorMapper.resolve(httpException(401, "Authentication required"), "fallback")

        assertTrue(resolution.clearLocalSession)
        assertEquals("Authentication required", resolution.message)
    }

    @Test
    fun `maps login 401 without detail to explicit invalid credentials copy`() {
        val resolution = SessionErrorMapper.resolveInteractiveLoginFailure(httpExceptionWithoutDetail(401))

        assertTrue(resolution.clearLocalSession)
        assertEquals("Neplatné uživatelské jméno nebo heslo.", resolution.message)
    }

    @Test
    fun `maps active role requirement to role selection`() {
        val resolution = SessionErrorMapper.resolve(httpException(403, "Active role must be selected"), "fallback")

        assertTrue(resolution.requireRoleSelection)
        assertEquals("Vyberte aktivní roli pro pokračování.", resolution.message)
    }

    private fun httpException(code: Int, detail: String): HttpException {
        val body = "{\"detail\":\"$detail\"}".toResponseBody("application/json".toMediaType())
        return HttpException(Response.error<Any>(code, body))
    }

    private fun httpExceptionWithoutDetail(code: Int): HttpException {
        return HttpException(Response.error<Any>(code, "{}".toResponseBody("application/json".toMediaType())))
    }
}
