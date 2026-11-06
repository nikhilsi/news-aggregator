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
    /// Labels from the server's AI step, main topic first (since Nov 1, 2026).
    let topics: [String]?
    /// Other outlets' articles about the same story (since Nov 1, 2026).
    let coverage: [Coverage]?

    var id: String { url }

    /// A story mainly about US politics: the ones that get the Fox News and NPR News marks.
    var isUSPolitics: Bool { topics?.first == "us_politics" }

    private enum CodingKeys: String, CodingKey {
        case title, summary, url, imageUrl, sourceId, sourceName, sourceType, category, sentiment, publishedAt, topics, coverage
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = try c.decode(String.self, forKey: .title)
        summary = try c.decodeIfPresent(String.self, forKey: .summary)
        url = try c.decode(String.self, forKey: .url)
        imageUrl = try c.decodeIfPresent(String.self, forKey: .imageUrl)
        sourceId = try c.decode(String.self, forKey: .sourceId)
        sourceName = try c.decode(String.self, forKey: .sourceName)
        sourceType = try c.decode(String.self, forKey: .sourceType)
        category = try c.decode(String.self, forKey: .category)
        sentiment = try c.decodeIfPresent(Double.self, forKey: .sentiment)
        publishedAt = try c.decodeIfPresent(Date.self, forKey: .publishedAt)
        // Added for 2.1. Leniently: if their shape ever changes, the article still shows without them.
        topics = (try? c.decodeIfPresent([String].self, forKey: .topics)) ?? nil
        coverage = (try? c.decodeIfPresent([Coverage].self, forKey: .coverage)) ?? nil
    }
}

/// Another outlet's headline for the same story.
struct Coverage: Codable, Hashable {
    let sourceName: String
    let title: String
    let url: String
}

struct ArticleListResponse: Codable {
    let articles: [Article]
    let pagination: Pagination
    let complete: Bool?
    /// When Today's brief was built. Only on the first tab without a search; null while it shows the full list.
    let briefAt: Date?

    private enum CodingKeys: String, CodingKey {
        case articles, pagination, complete, briefAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        articles = try c.decode([Article].self, forKey: .articles)
        pagination = try c.decode(Pagination.self, forKey: .pagination)
        complete = try c.decodeIfPresent(Bool.self, forKey: .complete)
        // Added for 2.1, leniently as above.
        briefAt = (try? c.decodeIfPresent(Date.self, forKey: .briefAt)) ?? nil
    }
}

struct Pagination: Codable {
    let page: Int
    let perPage: Int
    let total: Int
    let totalPages: Int
}
