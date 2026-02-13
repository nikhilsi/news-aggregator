import SwiftUI

struct ReaderView: View {
    let article: Article
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSettings.self) private var settings

    @State private var readerContent: ReaderContent?
    @State private var isLoading = true
    @State private var error: String?
    @State private var webViewHeight: CGFloat = 300

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Hero image — show immediately from article data
                    heroImage

                    VStack(alignment: .leading, spacing: 16) {
                        // Title
                        Text(readerContent?.title ?? article.title)
                            .font(.title2.bold())

                        // Metadata line
                        metadataLine

                        Divider()

                        // Content area
                        contentArea
                    }
                    .padding()
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left")
                            Text("Back")
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 16) {
                        if let url = URL(string: article.url) {
                            ShareLink(item: url, subject: Text(article.title)) {
                                Image(systemName: "square.and.arrow.up")
                            }
                        }
                        Link(destination: URL(string: article.url)!) {
                            HStack(spacing: 4) {
                                Text("Original")
                                Image(systemName: "arrow.up.right.square")
                            }
                            .font(.subheadline)
                        }
                    }
                }
            }
        }
        .task {
            await loadContent()
        }
    }

    // MARK: - Subviews

    @ViewBuilder
    private var heroImage: some View {
        let imageUrl = readerContent?.imageUrl ?? article.imageUrl
        if let imageUrl, let url = URL(string: imageUrl) {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(maxHeight: 250)
                        .clipped()
                }
            }
        }
    }

    private var metadataLine: some View {
        HStack(spacing: 6) {
            Text(readerContent?.sourceName ?? article.sourceName)
                .fontWeight(.medium)

            if let author = readerContent?.author {
                Text("·")
                Text(author)
            }

            if let publishedAt = article.publishedAt {
                Text("·")
                RelativeTimeText(date: publishedAt)
            }

            if let readTime = readerContent?.estimatedReadTime, readTime > 0 {
                Text("·")
                Text("\(readTime) min read")
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private var contentArea: some View {
        if isLoading {
            loadingSkeleton
        } else if let error {
            ErrorView(message: error) {
                Task { await loadContent() }
            }
        } else if let readerContent, readerContent.isFailed {
            failedView
        } else if let readerContent, readerContent.isOk, let html = readerContent.contentHtml {
            ReaderWebView(html: html, fontScale: settings.readerFontScale, contentHeight: $webViewHeight)
                .frame(height: webViewHeight)
        }
    }

    private var loadingSkeleton: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(0..<6, id: \.self) { i in
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemGray5))
                    .frame(width: i == 2 || i == 5 ? 200 : nil, height: 14)
                    .opacity(0.6)
            }
        }
        .padding(.vertical, 8)
    }

    private var failedView: some View {
        VStack(spacing: 16) {
            Text("This article couldn't be loaded in reader view.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Link(destination: URL(string: article.url)!) {
                HStack {
                    Text("Read on \(article.sourceName)")
                    Image(systemName: "arrow.up.right.square")
                }
                .font(.subheadline.bold())
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(.blue)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }

    // MARK: - Data

    private func loadContent() async {
        isLoading = true
        error = nil

        do {
            let encodedUrl = article.url.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? article.url
            readerContent = try await APIClient.shared.get(
                "/articles/reader",
                queryItems: [URLQueryItem(name: "url", value: encodedUrl)]
            )
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }
}
