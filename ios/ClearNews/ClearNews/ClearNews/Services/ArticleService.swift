import Foundation

@Observable
final class ArticleService {
    var articles: [Article] = []
    var isLoading = false
    var isLoadingMore = false
    var error: String?
    var hasMore = false
    var selectedCategory = "all"
    var searchQuery = ""

    private var currentPage = 1
    private var currentRequestId = 0

    func fetchArticles() async {
        currentPage = 1
        currentRequestId += 1
        let requestId = currentRequestId

        isLoading = true
        error = nil
        articles = []
        hasMore = false

        do {
            let response: ArticleListResponse = try await APIClient.shared.get(
                "/articles",
                queryItems: buildQueryItems(page: 1)
            )

            // Discard if a newer request was fired while this one was in-flight
            guard requestId == currentRequestId else { return }

            articles = response.articles
            hasMore = response.pagination.page < response.pagination.totalPages
        } catch {
            guard requestId == currentRequestId else { return }
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func loadMore() async {
        guard !isLoadingMore, !isLoading, hasMore else { return }

        let nextPage = currentPage + 1
        let requestId = currentRequestId

        isLoadingMore = true

        do {
            let response: ArticleListResponse = try await APIClient.shared.get(
                "/articles",
                queryItems: buildQueryItems(page: nextPage)
            )

            guard requestId == currentRequestId else { return }

            articles.append(contentsOf: response.articles)
            currentPage = nextPage
            hasMore = response.pagination.page < response.pagination.totalPages
        } catch {
            guard requestId == currentRequestId else { return }
            // Don't overwrite main error for loadMore failures — just stop loading
        }

        isLoadingMore = false
    }

    func selectCategory(_ category: String) {
        guard category != selectedCategory else { return }
        selectedCategory = category
    }

    func updateSearch(_ query: String) {
        searchQuery = query
    }

    // MARK: - Private

    private func buildQueryItems(page: Int) -> [URLQueryItem] {
        var items = [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "per_page", value: "20")
        ]
        if selectedCategory != "all" {
            items.append(URLQueryItem(name: "category", value: selectedCategory))
        }
        if !searchQuery.isEmpty {
            items.append(URLQueryItem(name: "search", value: searchQuery))
        }
        return items
    }
}
