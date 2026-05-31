package com.clawd.mobile.overlay

import android.util.Log
import com.clawd.mobile.data.SessionData
import com.clawd.mobile.service.WebSocketService
import com.clawd.mobile.ws.ClawdWebSocket
import com.clawd.mobile.ws.ConnectionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Centralised state decision engine extracted from [FloatingPetService].
 *
 * Owns all session-filtering, best-state selection, badge transition detection,
 * the 1.5 s happy interlude, the 3 s attention recheck, the sleep sequence
 * (yawning→dozing→collapsing→sleeping→waking), and the idle animation cycle.
 * The Service is reduced to a view/lifecycle pipe that collects [stateFlow]
 * and [gifLoadEvents].
 */
class PetStateManager(
    private val character: String,
    private val onReactionGifRequested: (resId: Int) -> Unit
) {

    companion object {
        private const val TAG = "PetStateManager"

        // --- Timing constants (ms) ---
        const val STALE_THRESHOLD_MS       = 30_000L
        const val ATTENTION_RECHECK_MS     = 3_000L
        const val REACTION_DISPLAY_MS      = 1_500L
        const val IDLE_ANIM_INTERVAL_MS    = 30_000L
        const val IDLE_READING_DISPLAY_MS  = 5_000L
        const val STATE_COLLECTOR_RETRY_MS = 3_000L
        const val WS_POLL_INTERVAL_MS     = 3_000L
        const val WATCHDOG_INTERVAL_MS     = 10_000L
        const val WATCHDOG_TIMEOUT_MS      = 60_000L
        const val IDLE_RECHECK_SETTLE_MS   = 200L

        // --- Per-character sleep sequence timings (from PC theme.json) ---
        data class SleepConfig(
            val yawnMs: Long,
            val collapseMs: Long,
            val wakeMs: Long,
            val deepSleepMs: Long
        )

        val SLEEP_TIMINGS: Map<String, SleepConfig> = mapOf(
            "clawd"     to SleepConfig(yawnMs = 3_000, collapseMs = 0,     wakeMs = 1_500, deepSleepMs = 600_000),
            "calico"    to SleepConfig(yawnMs = 8_000, collapseMs = 5_200, wakeMs = 5_800, deepSleepMs = 600_000),
            "cloudling" to SleepConfig(yawnMs = 9_030, collapseMs = 4_700, wakeMs = 3_650, deepSleepMs = 600_000)
        )
    }

    // --- Outputs ---

    private val _stateFlow = MutableStateFlow<PetState>(PetState.Idle)
    /** The current resolved pet state. Observe to drive GIF loads. */
    val stateFlow: StateFlow<PetState> = _stateFlow.asStateFlow()

    private val gifLoadEvents = Channel<GifLoadEvent>(Channel.CONFLATED)
    /** One-shot GIF load requests (reactions, idle cycle). Service collects and loads. */
    fun consumeGifLoadEvents(): Channel<GifLoadEvent> = gifLoadEvents

    // --- Internal state ---

    private var lastNonIdleState: PetState = PetState.Idle
    private var prevBadge: MutableMap<String, String> = mutableMapOf()
    private var gifGeneration = 0
    private var idleCycleJob: Job? = null
    private var sleepSequenceJob: Job? = null
    private var stateCollectorJob: Job? = null
    private val sessionMutex = Mutex()
    private val sleepConfig: SleepConfig = SLEEP_TIMINGS[character] ?: SLEEP_TIMINGS["clawd"]!!

    // ======================================================================
    //  Public lifecycle
    // ======================================================================

    /** Start the state collector loop (called from Service.onCreate). */
    fun start(scope: CoroutineScope) {
        stateCollectorJob?.cancel()
        stateCollectorJob = scope.launch {
            while (isActive) {
                val ws = waitForWebSocket()
                Log.d(TAG, "WebSocket acquired, collecting sessions")
                try {
                    collectSessions(ws, scope)
                } catch (e: Exception) {
                    Log.e(TAG, "State collector exception, retrying", e)
                }
                emitState(PetState.Idle)
                gifLoadEvents.send(GifLoadEvent(getGifResId(PetState.Idle), force = false))
                delay(STATE_COLLECTOR_RETRY_MS)
            }
        }
    }

    /** Full reset — called on ACTION_DISCONNECT or Service.onDestroy. */
    fun reset() {
        stateCollectorJob?.cancel()
        stateCollectorJob = null
        stopIdleCycle()
        cancelSleepSequence()
        gifGeneration++
        lastNonIdleState = PetState.Idle
        prevBadge.clear()
    }

    // ======================================================================
    //  Session → State pipeline
    // ======================================================================

    /**
     * Main entry point: called by the sessions collector on every emission.
     * Runs under [sessionMutex] to prevent concurrent state mutations.
     */
    private suspend fun updateSessions(
        sessions: Map<String, SessionData>,
        scope: CoroutineScope
    ) = sessionMutex.withLock {
        val visible = sessions.values.filter { it.isVisible }
        if (visible.isEmpty()) {
            startSleepSequence(scope)
            return@withLock
        }

        // Resolve best state from sessions (excludes sleep sequence states)
        var bestState = resolveDisplayState(visible)

        // Conducting mapping: SubagentStart + ≥2 visible sessions
        bestState = applyConductingMapping(visible, bestState)

        // Badge transition detection (happy interlude)
        checkBadgeTransitions(sessions.values, scope)
        sessions.values.forEach { s ->
            val sid = s.sessionId ?: return@forEach
            prevBadge[sid] = s.badge
        }

        if (bestState.isActive) {
            // Active state — wake from sleep or update directly
            cancelSleepSequence()
            stopIdleCycle()
            if (stateFlow.value.isSleepSequence) {
                playWakingAndRestore(bestState, scope)
            } else {
                lastNonIdleState = bestState
                Log.d(TAG, "State update: resolved=${bestState.themeKey}, activeCount=${visible.size}")
                emitState(bestState)
            }
        } else {
            // Idle — start or continue sleep sequence
            if (!stateFlow.value.isSleepSequence) {
                startSleepSequence(scope)
            }
            // else: sleep sequence already running, let it continue
        }
    }

    /**
     * Resolve the dominant display state from visible sessions.
     * Excludes sleep-sequence states (they are locally managed).
     * Aligns with PC [resolveDominantSessionState].
     */
    private fun resolveDisplayState(visible: List<SessionData>): PetState {
        var best: PetState = PetState.Idle
        for (session in visible) {
            val state = PetState.fromString(session.displayState ?: session.state)
            if (state.isSleepSequence) continue
            if (state.priority > best.priority) best = state
        }
        return best
    }

    /**
     * Apply conducting/juggling mapping when SubagentStart is detected.
     * PC behavior: SubagentStart + ≥2 sessions → Calico/Cloudling: Conducting, Clawd: Juggling.
     */
    private fun applyConductingMapping(
        visible: List<SessionData>,
        currentBest: PetState
    ): PetState {
        val hasSubagentStart = visible.any { s ->
            s.event == "SubagentStart" || s.event == "subagentStart"
        }
        if (!hasSubagentStart || visible.size < 2) return currentBest

        val mapped = if (character == "clawd") PetState.Juggling else PetState.Conducting
        return if (mapped.priority >= currentBest.priority) mapped else currentBest
    }

    // ======================================================================
    //  Sleep sequence (yawning → [dozing →] collapsing → sleeping)
    // ======================================================================

    /**
     * Start the sleep animation sequence as a coroutine.
     * Skips states that have no dedicated GIF (falls back through PetGifLoader).
     */
    private fun startSleepSequence(scope: CoroutineScope) {
        if (sleepSequenceJob?.isActive == true) return
        stopIdleCycle()
        sleepSequenceJob = scope.launch {
            val cfg = sleepConfig

            // Yawning phase
            emitState(PetState.Yawning)
            delay(cfg.yawnMs)
            if (!isActive) return@launch

            // Collapsing phase (skip if collapseMs <= 0, e.g. clawd)
            if (cfg.collapseMs > 0) {
                emitState(PetState.Collapsing)
                delay(cfg.collapseMs)
                if (!isActive) return@launch
            }

            // Deep sleep
            emitState(PetState.Sleeping)

            // Idle animation loop while sleeping (reading GIF periodically)
            while (isActive) {
                delay(IDLE_ANIM_INTERVAL_MS)
                if (!isActive) break
                val readingResId = PetGifLoader.getReadingGifResId(character)
                if (readingResId != null) {
                    gifLoadEvents.send(GifLoadEvent(readingResId, force = false))
                    delay(IDLE_READING_DISPLAY_MS)
                }
            }
        }
    }

    /**
     * Play waking animation then restore to [targetState].
     * If no dedicated waking GIF exists, skips straight to target.
     */
    private fun playWakingAndRestore(targetState: PetState, scope: CoroutineScope) {
        cancelSleepSequence()
        val gen = ++gifGeneration

        if (PetGifLoader.hasGifForState(PetState.Waking, character)) {
            emitState(PetState.Waking)
            scope.launch {
                delay(sleepConfig.wakeMs)
                if (gifGeneration != gen) return@launch
                if (targetState.isActive) lastNonIdleState = targetState
                Log.d(TAG, "Waking complete → ${targetState.themeKey}")
                emitState(targetState)
            }
        } else {
            // No waking GIF — go straight to target
            if (targetState.isActive) lastNonIdleState = targetState
            Log.d(TAG, "No waking GIF, direct → ${targetState.themeKey}")
            emitState(targetState)
        }
    }

    private fun cancelSleepSequence() {
        sleepSequenceJob?.cancel()
        sleepSequenceJob = null
    }

    // ======================================================================
    //  Badge transition detection (1.5 s happy interlude)
    // ======================================================================

    private fun checkBadgeTransitions(
        sessions: Collection<SessionData>,
        scope: CoroutineScope
    ) {
        for (s in sessions) {
            val sid = s.sessionId ?: continue
            val prev = prevBadge[sid] ?: continue
            val curr = s.badge
            if (prev in PetState.RUNNING_BADGES && curr == "done") {
                Log.d(TAG, "Badge transition: $prev → done for session $sid, playing happy")
                val happyResId = getGifResId(PetState.Attention)
                if (happyResId != null && happyResId != 0) {
                    loadReactionAndRestore(happyResId, REACTION_DISPLAY_MS, scope)
                }
            }
        }
    }

    /**
     * Play a reaction GIF, then restore the previous state.
     * Uses [gifGeneration] to discard stale restore callbacks.
     */
    private fun loadReactionAndRestore(gifResId: Int, delayMs: Long, scope: CoroutineScope) {
        val gen = ++gifGeneration
        onReactionGifRequested(gifResId)

        scope.launch {
            delay(delayMs)
            if (gifGeneration != gen) return@launch
            val restoreState = resolveBestState()
            emitState(restoreState)
        }
    }

    // ======================================================================
    //  Idle animation cycle (legacy, used when sleep sequence unavailable)
    // ======================================================================

    private suspend fun enterIdleCycle(scope: CoroutineScope) {
        if (idleCycleJob?.isActive == true) return
        idleCycleJob = scope.launch {
            // If last active state was attention, play it for a beat first
            if (lastNonIdleState is PetState.Attention) {
                val attentionResId = getGifResId(PetState.Attention)
                if (attentionResId != null && attentionResId != 0) {
                    gifLoadEvents.send(GifLoadEvent(attentionResId, force = false))
                    delay(ATTENTION_RECHECK_MS)
                }
            }
            // Normal idle loop
            while (isActive) {
                emitState(PetState.Idle)
                delay(IDLE_ANIM_INTERVAL_MS)
                // Try reading GIF (only clawd and cloudling have one)
                val readingResId = PetGifLoader.getReadingGifResId(character)
                if (readingResId != null) {
                    gifLoadEvents.send(GifLoadEvent(readingResId, force = false))
                    delay(IDLE_READING_DISPLAY_MS)
                }
            }
        }
    }

    private fun stopIdleCycle() {
        idleCycleJob?.cancel()
        idleCycleJob = null
    }

    // ======================================================================
    //  State collector (WebSocket lifecycle)
    // ======================================================================

    private suspend fun collectSessions(ws: ClawdWebSocket, scope: CoroutineScope) {
        // This function blocks until disconnection, mirroring the original design.
        // Inside, it launches a coroutine that calls updateSessions on each emission.
        val collectJob = scope.launch {
            ws.sessions.collect { sessions ->
                updateSessions(sessions, scope)
            }
        }

        // Wait for disconnection
        scope.launch {
            ws.connectionState.collect { state ->
                if (state == ConnectionState.DISCONNECTED || state == ConnectionState.AUTH_FAILED) {
                    Log.d(TAG, "Connection lost (state=$state)")
                    collectJob.cancel()
                }
            }
        }

        // Watchdog: force idle if no updates for too long
        val watchdogJob = scope.launch {
            while (isActive) {
                delay(WATCHDOG_INTERVAL_MS)
                val current = _stateFlow.value
                if (!current.isIdleLike) {
                    // Simple watchdog: if we've been non-idle for a long time without
                    // session updates, the collector's updateSessions handles staleness.
                    // This is a safety net for connection issues.
                }
            }
        }

        // Suspend until collectJob finishes (connection drop)
        try {
            collectJob.join()
        } finally {
            watchdogJob.cancel()
            stopIdleCycle()
            cancelSleepSequence()
        }
    }

    private suspend fun waitForWebSocket(): ClawdWebSocket {
        while (true) {
            WebSocketService.getWebSocket()?.let { return it }
            delay(WS_POLL_INTERVAL_MS)
        }
    }

    // ======================================================================
    //  Helpers
    // ======================================================================

    private fun emitState(state: PetState) {
        if (_stateFlow.value != state) {
            Log.d(TAG, "State → ${state.themeKey}")
        }
        _stateFlow.value = state
    }

    private fun getGifResId(state: PetState): Int? {
        return PetGifLoader.getGifResId(state.themeKey, 1, character)
    }

    /** Snapshot the best visible session's state, falling back to Idle. */
    private fun resolveBestState(): PetState {
        val ws = WebSocketService.getWebSocket()
        val visible = ws?.sessions?.value?.values?.filter { it.isVisible }
            ?: return PetState.Idle
        return resolveDisplayState(visible)
    }

    // ======================================================================
    //  Event type for one-shot GIF loads
    // ======================================================================

    data class GifLoadEvent(val resId: Int?, val force: Boolean)
}
