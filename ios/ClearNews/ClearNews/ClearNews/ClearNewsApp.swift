import SwiftUI

@main
struct ClearNewsApp: App {
    @State private var articleService = ArticleService()
    @State private var categoryService = CategoryService()
    @State private var appSettings = AppSettings()

    init() {
        // Larger URL cache so AsyncImage keeps images in memory (reduces flicker on scroll-back)
        URLCache.shared = URLCache(
            memoryCapacity: 100_000_000,  // 100 MB in-memory
            diskCapacity: 200_000_000     // 200 MB on disk
        )
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(articleService)
                .environment(categoryService)
                .environment(appSettings)
                .preferredColorScheme(appSettings.colorScheme)
                .task {
                    await categoryService.fetchCategories()
                }
        }
    }
}
