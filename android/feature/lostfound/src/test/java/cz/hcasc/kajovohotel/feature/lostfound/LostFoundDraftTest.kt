package cz.hcasc.kajovohotel.feature.lostfound

import cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundDraft
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LostFoundDraftTest {
    @Test
    fun submitRequiresCategoryDescriptionLocationAndDate() {
        assertFalse(LostFoundDraft().isValidForSubmit())
        assertTrue(LostFoundDraft(category = "Elektronika", description = "Mobil", location = "Lobby", eventAt = "2026-03-17").isValidForSubmit())
    }
}
