import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case httpError(statusCode: Int, detail: String?)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .httpError(let statusCode, let detail):
            return detail ?? "Server error (\(statusCode))"
        case .decodingError:
            return "Failed to process server response"
        case .networkError(let error):
            if (error as NSError).code == NSURLErrorNotConnectedToInternet {
                return "No internet connection"
            }
            if (error as NSError).code == NSURLErrorTimedOut {
                return "Request timed out"
            }
            return "Network error: \(error.localizedDescription)"
        }
    }
}

final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        session = URLSession(configuration: config)

        decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)

            // Try ISO 8601 with fractional seconds first, then without
            let formatters = [
                APIClient.isoFormatterWithFractional,
                APIClient.isoFormatter
            ]
            for formatter in formatters {
                if let date = formatter.date(from: string) {
                    return date
                }
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date: \(string)"
            )
        }
    }

    // MARK: - Date Formatters

    nonisolated(unsafe) private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    nonisolated(unsafe) private static let isoFormatterWithFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    // MARK: - Public API

    /// Health check — hits /health at root (not under /api/v1)
    func healthCheck() async throws -> HealthResponse {
        guard let url = URL(string: Constants.baseURL + "/health") else {
            throw APIError.invalidURL
        }
        let request = URLRequest(url: url)
        return try await execute(request)
    }

    func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem]? = nil) async throws -> T {
        let request = try buildRequest(path: path, queryItems: queryItems, method: "GET")
        return try await execute(request)
    }

    // MARK: - Private

    private func buildRequest(
        path: String,
        queryItems: [URLQueryItem]? = nil,
        method: String
    ) throws -> URLRequest {
        guard var components = URLComponents(string: Constants.apiBaseURL + path) else {
            throw APIError.invalidURL
        }
        if let queryItems, !queryItems.isEmpty {
            components.queryItems = queryItems
        }
        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method

        return request
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.networkError(
                NSError(domain: "APIClient", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
            )
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            // Try to extract FastAPI's { detail: "..." } error message
            let detail = try? JSONDecoder().decode(ErrorDetail.self, from: data).detail
            throw APIError.httpError(statusCode: httpResponse.statusCode, detail: detail)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}

// FastAPI error response shape
private struct ErrorDetail: Decodable {
    let detail: String
}

struct HealthResponse: Decodable {
    let status: String
}
