import Foundation

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct LoginResponse: Codable {
    let accessToken: String
    let tokenType: String
    let user: User
}

struct User: Codable, Identifiable {
    let id: Int
    let email: String
    let fullName: String?
    private let isAdminRaw: Int

    var isAdmin: Bool { isAdminRaw != 0 }

    enum CodingKeys: String, CodingKey {
        case id, email, fullName, isAdminRaw = "isAdmin"
    }
}
