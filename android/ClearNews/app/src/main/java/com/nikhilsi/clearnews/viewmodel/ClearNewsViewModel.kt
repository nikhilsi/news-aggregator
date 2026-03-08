package com.nikhilsi.clearnews.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.nikhilsi.clearnews.data.ApiClient
import com.nikhilsi.clearnews.model.Article
import com.nikhilsi.clearnews.model.Category
import com.nikhilsi.clearnews.model.ReaderContent
import com.nikhilsi.clearnews.state.AppSettings
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

private const val PER_PAGE = 20
private const val PARTIAL_RETRY_DELAY_MS = 3000L
private const val SEARCH_DEBOUNCE_MS = 400L

class ClearNewsViewModel(application: Application) : AndroidViewModel(application) {

    val settings = AppSettings(application)

    // Categories
    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    // Articles
    private val _articles = MutableStateFlow<List<Article>>(emptyList())
    val articles: StateFlow<List<Article>> = _articles.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _isLoadingMore = MutableStateFlow(false)
    val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _hasMore = MutableStateFlow(false)
    val hasMore: StateFlow<Boolean> = _hasMore.asStateFlow()

    private val _selectedCategory = MutableStateFlow("all")
    val selectedCategory: StateFlow<String> = _selectedCategory.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    // Reader
    private val _selectedArticle = MutableStateFlow<Article?>(null)
    val selectedArticle: StateFlow<Article?> = _selectedArticle.asStateFlow()

    private val _readerContent = MutableStateFlow<ReaderContent?>(null)
    val readerContent: StateFlow<ReaderContent?> = _readerContent.asStateFlow()

    private val _isReaderLoading = MutableStateFlow(false)
    val isReaderLoading: StateFlow<Boolean> = _isReaderLoading.asStateFlow()

    private val _readerError = MutableStateFlow<String?>(null)
    val readerError: StateFlow<String?> = _readerError.asStateFlow()

    // Internal state for stale request tracking and pagination
    private var currentPage = 1
    private var currentRequestId = 0
    private var searchJob: Job? = null

    init {
        viewModelScope.launch { loadCategories() }
        viewModelScope.launch { fetchArticles(isRefresh = false) }
    }

    private suspend fun loadCategories() {
        try {
            _categories.value = ApiClient.fetchCategories()
        } catch (_: Exception) {
            // Non-critical — category tabs simply don't render
        }
    }

    fun selectCategory(category: String) {
        if (category == _selectedCategory.value) return
        _selectedCategory.value = category
        viewModelScope.launch { fetchArticles(isRefresh = false) }
    }

    fun updateSearch(query: String) {
        _searchQuery.value = query
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            fetchArticles(isRefresh = false)
        }
    }

    fun refresh() {
        viewModelScope.launch { fetchArticles(isRefresh = true) }
    }

    fun loadMore() {
        if (_isLoadingMore.value || _isLoading.value || !_hasMore.value) return
        viewModelScope.launch { fetchMoreArticles() }
    }

    private suspend fun fetchArticles(isRefresh: Boolean) {
        currentPage = 1
        currentRequestId++
        val requestId = currentRequestId

        _isLoading.value = true
        _error.value = null

        try {
            val response = ApiClient.fetchArticles(
                category = _selectedCategory.value,
                search = _searchQuery.value.ifBlank { null },
                page = 1,
                perPage = PER_PAGE,
                refresh = isRefresh,
            )

            if (requestId != currentRequestId) return

            _articles.value = response.articles
            _hasMore.value = response.pagination.page < response.pagination.totalPages
            _isLoading.value = false

            // Auto-retry on partial data (cold cache only, not manual refresh)
            if (response.complete == false && !isRefresh) {
                delay(PARTIAL_RETRY_DELAY_MS)
                if (requestId != currentRequestId) return

                try {
                    val retryResponse = ApiClient.fetchArticles(
                        category = _selectedCategory.value,
                        search = _searchQuery.value.ifBlank { null },
                        page = 1,
                        perPage = PER_PAGE,
                    )
                    if (requestId != currentRequestId) return
                    _articles.value = retryResponse.articles
                    _hasMore.value = retryResponse.pagination.page < retryResponse.pagination.totalPages
                } catch (_: Exception) {
                    // Silent fail — user already has partial data
                }
            }
        } catch (e: Exception) {
            if (requestId != currentRequestId) return
            _error.value = e.message ?: "Unknown error"
            _isLoading.value = false
        }
    }

    private suspend fun fetchMoreArticles() {
        val nextPage = currentPage + 1
        val requestId = currentRequestId

        _isLoadingMore.value = true

        try {
            val response = ApiClient.fetchArticles(
                category = _selectedCategory.value,
                search = _searchQuery.value.ifBlank { null },
                page = nextPage,
                perPage = PER_PAGE,
            )

            if (requestId != currentRequestId) return

            _articles.value = _articles.value + response.articles
            currentPage = nextPage
            _hasMore.value = response.pagination.page < response.pagination.totalPages
        } catch (_: Exception) {
            // Don't overwrite main error for loadMore failures
        }

        _isLoadingMore.value = false
    }

    // Reader

    fun openReader(article: Article) {
        _selectedArticle.value = article
        _readerContent.value = null
        _readerError.value = null
        _isReaderLoading.value = true
        viewModelScope.launch { loadReaderContent(article.url) }
    }

    fun closeReader() {
        _selectedArticle.value = null
        _readerContent.value = null
        _readerError.value = null
        _isReaderLoading.value = false
    }

    fun retryReader() {
        val article = _selectedArticle.value ?: return
        _readerError.value = null
        _isReaderLoading.value = true
        viewModelScope.launch { loadReaderContent(article.url) }
    }

    private suspend fun loadReaderContent(articleUrl: String) {
        try {
            val content = ApiClient.fetchReaderContent(articleUrl)
            _readerContent.value = content
        } catch (e: Exception) {
            _readerError.value = e.message ?: "Failed to load article"
        }
        _isReaderLoading.value = false
    }
}
