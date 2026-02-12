import Foundation

@Observable
final class AuthService {
    var user: User?
    var isLoading = false
    var error: String?

    var isAuthenticated: Bool { user != nil }

    private let tokenKey = "jwt_token"

    /// On app launch: check Keychain for saved token, validate with /auth/me
    func validateSavedToken() async {
        guard let token = KeychainHelper.read(tokenKey) else { return }

        APIClient.shared.token = token
        do {
            user = try await APIClient.shared.get("/auth/me")
        } catch {
            // Token expired or invalid — clear it
            KeychainHelper.delete(tokenKey)
            APIClient.shared.token = nil
        }
    }

    func login(email: String, password: String) async {
        isLoading = true
        error = nil

        do {
            let response: LoginResponse = try await APIClient.shared.post(
                "/auth/login",
                body: LoginRequest(email: email, password: password)
            )

            KeychainHelper.save(response.accessToken, for: tokenKey)
            APIClient.shared.token = response.accessToken
            user = response.user
        } catch let apiError as APIError {
            self.error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    func logout() {
        KeychainHelper.delete(tokenKey)
        APIClient.shared.token = nil
        user = nil
    }
}
