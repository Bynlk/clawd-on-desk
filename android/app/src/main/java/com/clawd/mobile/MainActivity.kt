package com.clawd.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.clawd.mobile.ui.theme.ClawdMobileTheme
import com.clawd.mobile.ui.navigation.ClawdNavGraph

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ClawdMobileTheme {
                ClawdNavGraph()
            }
        }
    }
}
