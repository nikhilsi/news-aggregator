package com.nikhilsi.clearnews.state

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class AppSettings(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("clearnews_settings", Context.MODE_PRIVATE)

    private val _appearance = MutableStateFlow(
        prefs.getString("appearance", "system") ?: "system"
    )
    val appearance: StateFlow<String> = _appearance.asStateFlow()

    private val _readerFontScale = MutableStateFlow(
        prefs.getFloat("readerFontScale", 1.0f)
    )
    val readerFontScale: StateFlow<Float> = _readerFontScale.asStateFlow()

    fun setAppearance(value: String) {
        _appearance.value = value
        prefs.edit().putString("appearance", value).apply()
    }

    fun setReaderFontScale(scale: Float) {
        _readerFontScale.value = scale
        prefs.edit().putFloat("readerFontScale", scale).apply()
    }
}
