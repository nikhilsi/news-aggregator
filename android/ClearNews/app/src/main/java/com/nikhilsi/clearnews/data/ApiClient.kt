package com.nikhilsi.clearnews.data

import com.nikhilsi.clearnews.model.ArticleListResponse
import com.nikhilsi.clearnews.model.Category
import com.nikhilsi.clearnews.model.ReaderContent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit

object ApiClient {

    private const val BASE_URL = "https://getclearnews.com"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun fetchArticles(
        category: String = "all",
        search: String? = null,
        page: Int = 1,
        perPage: Int = 20,
        refresh: Boolean = false,
    ): ArticleListResponse = withContext(Dispatchers.IO) {
        val url = "$BASE_URL/api/v1/articles".toHttpUrl().newBuilder().apply {
            if (category != "all") addQueryParameter("category", category)
            if (!search.isNullOrBlank()) addQueryParameter("search", search)
            addQueryParameter("page", page.toString())
            addQueryParameter("per_page", perPage.toString())
            if (refresh) addQueryParameter("refresh", "true")
        }.build()

        val body = executeGet(url)
        json.decodeFromString<ArticleListResponse>(body)
    }

    suspend fun fetchCategories(): List<Category> = withContext(Dispatchers.IO) {
        val url = "$BASE_URL/api/v1/categories".toHttpUrl()
        val body = executeGet(url)
        json.decodeFromString<List<Category>>(body)
    }

    suspend fun fetchReaderContent(articleUrl: String): ReaderContent = withContext(Dispatchers.IO) {
        val url = "$BASE_URL/api/v1/articles/reader".toHttpUrl().newBuilder()
            .addQueryParameter("url", articleUrl)
            .build()
        val body = executeGet(url)
        json.decodeFromString<ReaderContent>(body)
    }

    private fun executeGet(url: HttpUrl): String {
        val request = Request.Builder().url(url).get().build()

        val response = try {
            client.newCall(request).execute()
        } catch (e: UnknownHostException) {
            throw ApiException("No internet connection")
        } catch (e: SocketTimeoutException) {
            throw ApiException("Request timed out")
        } catch (e: IOException) {
            throw ApiException("Network error: ${e.message}")
        }

        val responseBody = response.body?.string()
            ?: throw ApiException("Empty response from server")

        if (!response.isSuccessful) {
            val detail = try {
                json.decodeFromString<ErrorDetail>(responseBody).detail
            } catch (_: Exception) {
                null
            }
            throw ApiException(detail ?: "Server error (${response.code})")
        }

        return responseBody
    }

    @kotlinx.serialization.Serializable
    private data class ErrorDetail(val detail: String? = null)
}

class ApiException(message: String) : Exception(message)
