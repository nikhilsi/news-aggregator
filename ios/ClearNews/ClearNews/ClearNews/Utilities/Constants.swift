import Foundation

enum Constants {
    static let appName = "ClearNews"

    // Develop against production API (backend is live and stable)
    // To switch to localhost, change to: "http://localhost:8000"
    static let baseURL = "https://getclearnews.com"
    static let apiBaseURL = baseURL + "/api/v1"
}
