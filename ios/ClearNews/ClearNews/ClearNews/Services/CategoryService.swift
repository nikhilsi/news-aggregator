import Foundation

@MainActor
@Observable
final class CategoryService {
    private(set) var categories: [Category] = []
    private(set) var isLoading = false

    func fetchCategories() async {
        isLoading = true
        do {
            categories = try await APIClient.shared.get("/categories")
        } catch {
            // Categories are non-critical — show articles without tabs if this fails
            categories = []
        }
        isLoading = false
    }
}
