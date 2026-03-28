package cz.hcasc.kajovohotel.feature.lostfound

import cz.hcasc.kajovohotel.feature.lostfound.domain.LostFoundDraft
import cz.hcasc.kajovohotel.feature.lostfound.domain.selectedTags
import cz.hcasc.kajovohotel.feature.lostfound.domain.toggleTag
import cz.hcasc.kajovohotel.feature.lostfound.domain.isValidForSubmit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LostFoundDraftTest {
    @Test
    fun submitRequiresCategoryDescriptionLocationAndDate() {
        assertFalse(LostFoundDraft().isValidForSubmit())
        assertTrue(LostFoundDraft(category = "Elektronika", description = "Mobil", location = "Lobby", eventAt = "2026-03-17").isValidForSubmit())
    }

    @Test
    fun toggleTagAddsAndRemovesKnownTagDeterministically() {
        val updated = LostFoundDraft(tags = "").toggleTag("kontaktova").toggleTag("vyzvedne")
        assertEquals(setOf("kontaktova", "vyzvedne"), updated.selectedTags())

        val removed = updated.toggleTag("kontaktova")
        assertEquals(setOf("vyzvedne"), removed.selectedTags())
    }
}
