import Foundation

struct Article: Codable, Identifiable, Hashable {
    let title: String
    let summary: String?
    let url: String
    let imageUrl: String?
    let sourceId: String
    let sourceName: String
    let sourceType: String
    let category: String
    let sentiment: Double?
    let publishedAt: Date?

    var id: String { url }
}

struct ArticleListResponse: Codable {
    let articles: [Article]
    let pagination: Pagination
}

struct Pagination: Codable {
    let page: Int
    let perPage: Int
    let total: Int
    let totalPages: Int
}
