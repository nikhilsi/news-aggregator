import SwiftUI

struct HomeView: View {
    @Environment(ArticleService.self) private var articleService
    @Environment(CategoryService.self) private var categoryService
    @Environment(\.scenePhase) private var scenePhase
    @State private var searchText = ""
    @State private var selectedTarget: ReaderTarget?

    var body: some View {
        @Bindable var articleService = articleService

        NavigationStack {
            VStack(spacing: 0) {
                // Category pills — only show once loaded
                if !categoryService.categories.isEmpty {
                    CategoryTabsView(selectedCategory: $articleService.selectedCategory)
                }

                ArticleListView(onOpen: { target in
                    selectedTarget = target
                })
            }
            .navigationTitle("ClearNews")
            .searchable(text: $searchText, prompt: "Search articles")
        }
        .sheet(item: $selectedTarget) { target in
            ReaderView(target: target)
        }
        .task {
            await articleService.fetchArticles()
        }
        .task(id: searchText) {
            // Skip if search hasn't changed (e.g., on initial appear)
            guard searchText != articleService.searchQuery else { return }
            // Debounce: wait 400ms after user stops typing
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            articleService.updateSearch(searchText)
            await articleService.fetchArticles()
        }
        .onChange(of: articleService.selectedCategory) {
            Task { await articleService.fetchArticles() }
        }
        .onChange(of: scenePhase) { _, phase in
            // Back in the app: once Today's brief is an hour old, a newer edition exists.
            if phase == .active, let briefAt = articleService.briefAt,
               Date().timeIntervalSince(briefAt) > TodayView.editionInterval {
                Task { await articleService.fetchArticles(refresh: true) }
            }
        }
    }
}
