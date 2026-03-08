package com.nikhilsi.clearnews.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Article(
    val title: String,
    val summary: String? = null,
    val url: String,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("source_id") val sourceId: String,
    @SerialName("source_name") val sourceName: String,
    @SerialName("source_type") val sourceType: String,
    val category: String,
    val sentiment: Double? = null,
    @SerialName("published_at") val publishedAt: String? = null,
)

@Serializable
data class Pagination(
    val page: Int,
    @SerialName("per_page") val perPage: Int,
    val total: Int,
    @SerialName("total_pages") val totalPages: Int,
)

@Serializable
data class ArticleListResponse(
    val articles: List<Article>,
    val pagination: Pagination,
    val complete: Boolean? = null,
)
