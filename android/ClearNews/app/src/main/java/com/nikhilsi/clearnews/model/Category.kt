package com.nikhilsi.clearnews.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Category(
    val id: String,
    val name: String,
    @SerialName("source_count") val sourceCount: Int,
)

@Serializable
data class CategoryListResponse(
    val categories: List<Category>,
)
