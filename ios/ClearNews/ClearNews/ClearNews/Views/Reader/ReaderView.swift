import SwiftUI

struct ReaderView: View {
    let target: ReaderTarget
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSettings.self) private var settings

    @State private var readerContent: ReaderContent?
    @State private var isLoading = true
    @State private var error: String?
    @State private var webViewHeight: CGFloat = 300

    /// The photo above the title holds this height while it loads, so the text never moves when it arrives.
    private static let heroHeight: CGFloat = 230

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    heroImage

                    VStack(alignment: .leading, spacing: 16) {
                        // Title
                        Text(readerContent?.title ?? target.title)
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
                    .accessibilityLabel("Close reader")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 16) {
                        if let url = URL(string: target.url) {
                            ShareLink(item: url, subject: Text(target.title)) {
                                Image(systemName: "square.and.arrow.up")
                            }
                            .accessibilityLabel("Share article")
                        }
                        if let originalURL = URL(string: target.url) {
                            Link(destination: originalURL) {
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
        }
        .task {
            await loadContent()
        }
    }

    // MARK: - Subviews

    private var sourceName: String {
        readerContent?.sourceName ?? target.sourceName
    }

    /// The list's photo, usually cached already, so it shows at once. Coverage links have none
    /// and show no photo, so the title never jumps when the reader answers.
    private var heroURL: URL? {
        target.imageUrl.flatMap { URL(string: $0) }
    }

    /// The reader's resized copy of the photo, tried when the list's photo fails to load.
    private var fallbackHeroURL: URL? {
        guard let address = readerContent?.imageUrl, address != target.imageUrl else { return nil }
        return URL(string: address)
    }

    @ViewBuilder
    private var heroImage: some View {
        if let url = heroURL {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    heroFill(image)
                case .failure:
                    if let fallback = fallbackHeroURL {
                        AsyncImage(url: fallback) { second in
                            if let image = second.image {
                                heroFill(image)
                            } else if second.error == nil {
                                heroPlaceholder
                            }
                        }
                    } else if isLoading {
                        // Hold the place until the reader answers with its copy.
                        heroPlaceholder
                    }
                default:
                    heroPlaceholder
                }
            }
            .accessibilityHidden(true)
        }
    }

    /// The photo fills a fixed box as an overlay, so a very wide photo cannot widen the page.
    private func heroFill(_ image: Image) -> some View {
        Color.clear
            .frame(height: Self.heroHeight)
            .frame(maxWidth: .infinity)
            .overlay {
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            }
            .clipped()
    }

    private var heroPlaceholder: some View {
        Rectangle()
            .fill(Color(.systemGray5))
            .frame(height: Self.heroHeight)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
    }

    /// One line of text that wraps as a whole, so a long author never squeezes it into columns.
    private var metadataLine: some View {
        var parts: [String] = []
        if let author = readerContent?.author { parts.append(author) }
        if let publishedAt = readerContent?.publishedAt ?? target.publishedAt {
            parts.append(RelativeTimeText.format(publishedAt))
        }
        if let readTime = readerContent?.estimatedReadTime, readTime > 0 {
            parts.append("\(readTime) min read")
        }
        var line = AttributedString(sourceName)
        line.font = .caption.weight(.medium)
        for part in parts {
            line += AttributedString(" · \(part)")
        }
        return Text(line)
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
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
            failedView(reason: readerContent.reason)
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

    /// What to say when the reader could not show the article, by the server's reason (as the web's reader.ts).
    static func failureMessage(reason: String?, source: String) -> String {
        switch reason {
        case "forbidden":
            return "\(source) doesn't allow reader view."
        case "timeout":
            return "\(source) took too long to respond."
        case "video":
            return "This is a video, not an article."
        case "extraction_empty":
            return "We couldn't find the article text on this page."
        default:
            return "This article couldn't be loaded in reader view."
        }
    }

    private func failedView(reason: String?) -> some View {
        VStack(spacing: 16) {
            Text(Self.failureMessage(reason: reason, source: sourceName))
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if let originalURL = URL(string: target.url) {
                Link(destination: originalURL) {
                    HStack {
                        Text(reason == "video" ? "Watch on \(sourceName)" : "Read on \(sourceName)")
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
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }

    // MARK: - Data

    private func loadContent() async {
        isLoading = true
        error = nil

        do {
            readerContent = try await APIClient.shared.get(
                "/articles/reader",
                queryItems: [URLQueryItem(name: "url", value: target.url)]
            )
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }
}
