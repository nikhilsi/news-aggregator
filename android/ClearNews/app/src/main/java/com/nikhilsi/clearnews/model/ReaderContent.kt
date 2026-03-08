package com.nikhilsi.clearnews.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ReaderContent(
    val status: String,
    val url: String,
    val title: String? = null,
    val author: String? = null,
    @SerialName("content_html") val contentHtml: String? = null,
    @SerialName("word_count") val wordCount: Int? = null,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("source_name") val sourceName: String? = null,
    @SerialName("published_at") val publishedAt: String? = null,
    @SerialName("extracted_at") val extractedAt: String? = null,
    val reason: String? = null,
) {
    val isOk: Boolean get() = status == "ok"
    val isFailed: Boolean get() = status == "failed"

    val estimatedReadTime: Int
        get() {
            val wc = wordCount ?: return 0
            return maxOf(1, wc / 200)
        }
}
