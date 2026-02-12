import SwiftUI

struct CategoryTabsView: View {
    @Environment(CategoryService.self) private var categoryService
    @Binding var selectedCategory: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(categoryService.categories) { category in
                    let isSelected = category.id == selectedCategory

                    Button {
                        selectedCategory = category.id
                    } label: {
                        Text(category.name)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                isSelected
                                    ? Color.blue.opacity(0.15)
                                    : Color(.systemGray6)
                            )
                            .foregroundStyle(isSelected ? .blue : .secondary)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 4)
        }
    }
}
