import Foundation

@Observable
final class CategoryService {
    var categories: [Category] = []
    var isLoading = false

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
