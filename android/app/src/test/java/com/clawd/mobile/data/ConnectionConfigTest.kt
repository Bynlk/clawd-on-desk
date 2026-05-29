package com.clawd.mobile.data

import org.junit.Test
import org.junit.Assert.*

class ConnectionConfigTest {
    @Test
    fun `parse valid clawd url`() {
        val config = ConnectionConfig.fromClawdUrl("clawd://192.168.1.10:23333/abcdef1234567890abcdef1234567890")
        assertNotNull(config)
        assertEquals("192.168.1.10", config!!.host)
        assertEquals(23333, config.port)
        assertEquals("abcdef1234567890abcdef1234567890", config.token)
    }

    @Test
    fun `reject invalid url`() {
        assertNull(ConnectionConfig.fromClawdUrl("http://example.com"))
        assertNull(ConnectionConfig.fromClawdUrl("clawd://192.168.1.10:23333/short"))
    }

    @Test
    fun `generate correct ws url`() {
        val config = ConnectionConfig("192.168.1.10", 23333, "abcdef1234567890abcdef1234567890")
        assertEquals("ws://192.168.1.10:23333/ws?token=abcdef1234567890abcdef1234567890", config.wsUrl())
    }

    @Test
    fun `generate correct pair url`() {
        val config = ConnectionConfig("192.168.1.10", 23333, "abcdef1234567890abcdef1234567890")
        assertEquals("clawd://192.168.1.10:23333/abcdef1234567890abcdef1234567890", config.pairUrl())
    }
}
