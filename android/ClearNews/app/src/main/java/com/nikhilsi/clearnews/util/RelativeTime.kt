package com.nikhilsi.clearnews.util

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

private val shortDateFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("MMM d")

fun relativeTimeString(isoDate: String?): String {
    if (isoDate == null) return ""
    val instant = try {
        Instant.parse(isoDate)
    } catch (_: Exception) {
        return ""
    }

    val now = Instant.now()
    val seconds = ChronoUnit.SECONDS.between(instant, now)

    return when {
        seconds < 60 -> "just now"
        seconds < 3600 -> "${seconds / 60}m ago"
        seconds < 86400 -> "${seconds / 3600}h ago"
        seconds < 604800 -> "${seconds / 86400}d ago"
        else -> {
            val localDate = instant.atZone(ZoneId.systemDefault()).toLocalDate()
            localDate.format(shortDateFormatter)
        }
    }
}
