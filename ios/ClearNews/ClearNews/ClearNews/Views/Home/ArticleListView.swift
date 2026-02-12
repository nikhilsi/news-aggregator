import SwiftUI

struct ArticleListView: View {
    @Environment(ArticleService.self) private var articleService
    var onArticleTap: (Article) -> Void

    var body: some View {
        if articleService.isLoading {
            SkeletonListView()
        } else if let error = articleService.error {
            ErrorView(message: error) {
                Task { await articleService.fetchArticles() }
            }
        } else if articleService.articles.isEmpty {
            EmptyStateView()
        } else {
            articleList
        }
    }

    private var articleList: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(articleService.articles) { article in
                    ArticleCardView(article: article)
                        .onTapGesture { onArticleTap(article) }
                }

                // Infinite scroll sentinel
                if articleService.hasMore {
                    ProgressView()
                        .padding()
                        .onAppear {
                            Task { await articleService.loadMore() }
                        }
                } else {
                    // End of feed
                    Text("You're all caught up")
                        .font(.subheadline)
                        .foregroundStyle(.tertiary)
                        .padding(.vertical, 20)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
        .refreshable {
            await articleService.fetchArticles(refresh: true)
        }
    }
}
