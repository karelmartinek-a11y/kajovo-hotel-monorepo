package cz.hcasc.kajovohotel.feature.housekeeping

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import cz.hcasc.kajovohotel.feature.housekeeping.domain.HousekeepingTileTone
import org.junit.Assert.assertTrue
import org.junit.Test

class HousekeepingTileColorTest {
    @Test
    fun `green tile shades are saturated and the stronger green is darker`() {
        val lightGreen = housekeepingToneColor(HousekeepingTileTone.LIGHT_GREEN)
        val green = housekeepingToneColor(HousekeepingTileTone.GREEN)

        assertTrue("Light green should be vivid", lightGreen.green - maxOf(lightGreen.red, lightGreen.blue) > 0.3f)
        assertTrue("Strong green should be vivid", green.green - maxOf(green.red, green.blue) > 0.3f)
        assertTrue("Strong green should be darker than light green", green.luminance() < lightGreen.luminance())
        assertTrue("Both greens must keep dark tile text readable", contrast(Color(0xFF1B1B1B), lightGreen) >= 4.5f && contrast(Color(0xFF1B1B1B), green) >= 4.5f)
    }

    private fun contrast(first: Color, second: Color): Float {
        val a = first.luminance()
        val b = second.luminance()
        return (maxOf(a, b) + 0.05f) / (minOf(a, b) + 0.05f)
    }
}
