package com.clawd.mobile.data

import org.junit.Test
import org.junit.Assert.*

class ConnectionConfigTest {
    @Test
    fun `parse valid clawd url`() {
        val config = ConnectionConfig.fromClawdUrl("clawd://192.168.1.10:23334/abcdef1234567890abcdef1234567890")
        assertNotNull(config)
        assertEquals("192.168.1.10", config!!.host)
        assertEquals(23334, config.port)
        assertEquals("abcdef1234567890abcdef1234567890", config.token)
    }

    @Test
    fun `reject invalid url`() {
        assertNull(ConnectionConfig.fromClawdUrl("http://example.com"))
        assertNull(ConnectionConfig.fromClawdUrl("clawd://192.168.1.10:23334/short"))
    }

    @Test
    fun `generate correct stream url`() {
        val config = ConnectionConfig("192.168.1.10", 23334, "abcdef1234567890abcdef1234567890")
        assertEquals("http://192.168.1.10:23334/mobile/stream", config.streamUrl())
    }

    @Test
    fun `generate correct approve url`() {
        val config = ConnectionConfig("192.168.1.10", 23334, "abcdef1234567890abcdef1234567890")
        assertEquals("http://192.168.1.10:23334/mobile/approve", config.approveUrl())
    }

    @Test
    fun `generate correct pair url`() {
        val config = ConnectionConfig("192.168.1.10", 23334, "abcdef1234567890abcdef1234567890")
        assertEquals("clawd://192.168.1.10:23334/abcdef1234567890abcdef1234567890", config.pairUrl())
    }
}
