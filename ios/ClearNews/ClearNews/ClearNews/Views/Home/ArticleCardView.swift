import SwiftUI

struct ArticleCardView: View {
    let article: Article
    @ScaledMetric(relativeTo: .subheadline) private var contentPadding: CGFloat = 12

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Hero image or gradient placeholder
            ZStack {
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [Color(.systemGray5), Color(.systemGray4)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                if let imageUrl = article.imageUrl, let url = URL(string: imageUrl) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                        default:
                            EmptyView()
                        }
                    }
                }
            }
            .frame(height: 180)
            .clipped()

            // Content
            VStack(alignment: .leading, spacing: 8) {
                // Title — 2 lines
                Text(article.title)
                    .font(.headline)
                    .lineLimit(2)
                    .foregroundStyle(.primary)

                // Summary — 3 lines
                if let summary = article.summary {
                    Text(summary)
                        .font(.subheadline)
                        .lineLimit(3)
                        .foregroundStyle(.secondary)
                }

                // Footer: source + time + share
                HStack {
                    Text(article.sourceName)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(.secondary)

                    Spacer()

                    if let publishedAt = article.publishedAt {
                        RelativeTimeText(date: publishedAt)
                    }

                    if let url = URL(string: article.url) {
                        ShareLink(item: url, subject: Text(article.title)) {
                            Image(systemName: "square.and.arrow.up")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(contentPadding)
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.08), radius: 4, y: 2)
    }
}
