import Foundation

struct Category: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let sourceCount: Int
}
