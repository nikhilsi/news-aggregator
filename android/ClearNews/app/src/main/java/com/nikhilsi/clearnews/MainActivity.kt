package com.nikhilsi.clearnews

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.rememberNavController
import com.nikhilsi.clearnews.theme.ClearNewsTheme
import com.nikhilsi.clearnews.ui.navigation.ClearNewsNavGraph
import com.nikhilsi.clearnews.viewmodel.ClearNewsViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val viewModel: ClearNewsViewModel = viewModel()
            val appearance by viewModel.settings.appearance.collectAsState()

            ClearNewsTheme(appearance = appearance) {
                val navController = rememberNavController()
                ClearNewsNavGraph(
                    navController = navController,
                    viewModel = viewModel,
                )
            }
        }
    }
}
