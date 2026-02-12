import SwiftUI

@main
struct ClearNewsApp: App {
    @State private var articleService = ArticleService()
    @State private var categoryService = CategoryService()
    @State private var authService = AuthService()
    @State private var appSettings = AppSettings()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(articleService)
                .environment(categoryService)
                .environment(authService)
                .environment(appSettings)
                .preferredColorScheme(appSettings.colorScheme)
                .task {
                    await categoryService.fetchCategories()
                    await authService.validateSavedToken()
                }
        }
    }
}
