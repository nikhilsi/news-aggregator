import Foundation

/// What the reader opens: an article from a list, or another outlet's headline
/// from a "Covered by N outlets" list. Coverage entries carry no photo or date,
/// and the server often has none for them either, so the reader falls back to
/// what is known here.
struct ReaderTarget: Identifiable, Hashable {
    let url: String
    let title: String
    let sourceName: String
    let imageUrl: String?
    let publishedAt: Date?

    var id: String { url }

    init(_ article: Article) {
        url = article.url
        title = article.title
        sourceName = article.sourceName
        imageUrl = article.imageUrl
        publishedAt = article.publishedAt
    }

    /// A story from a tapped morning edition (#435): its address, headline and outlet.
    init(url: String, title: String, sourceName: String) {
        self.url = url
        self.title = title
        self.sourceName = sourceName
        imageUrl = nil
        publishedAt = nil
    }

    init(_ coverage: Coverage) {
        url = coverage.url
        title = coverage.title
        sourceName = coverage.sourceName
        imageUrl = nil
        publishedAt = nil
    }
}
