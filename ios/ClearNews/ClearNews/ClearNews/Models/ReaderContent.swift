import Foundation

struct ReaderContent: Codable {
    let status: String
    let url: String
    let title: String?
    let author: String?
    let contentHtml: String?
    let wordCount: Int?
    let imageUrl: String?
    let sourceName: String?
    let publishedAt: Date?
    let extractedAt: String?
    let reason: String?

    var isOk: Bool { status == "ok" }
    var isFailed: Bool { status == "failed" }

    var estimatedReadTime: Int {
        guard let wordCount else { return 0 }
        return max(1, wordCount / 200)
    }
}
