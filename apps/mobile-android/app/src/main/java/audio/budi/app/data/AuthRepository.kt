package audio.budi.app.data

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiService: ApiService
) {
    private val prefs: SharedPreferences = context.getSharedPreferences("budi_auth", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_TOKEN = "auth_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USER_EMAIL = "user_email"
    }

    fun getToken(): String? = prefs.getString(KEY_TOKEN, null)

    fun isAuthenticated(): Boolean = getToken() != null

    suspend fun register(email: String): User {
        val response = apiService.register(RegisterRequest(email))
        saveAuth(response)
        return response.user
    }

    suspend fun getCurrentUser(): User? {
        return try {
            if (isAuthenticated()) {
                apiService.getMe()
            } else null
        } catch (e: Exception) {
            null
        }
    }

    fun logout() {
        prefs.edit().clear().apply()
    }

    private fun saveAuth(response: AuthResponse) {
        prefs.edit()
            .putString(KEY_TOKEN, response.token)
            .putString(KEY_USER_ID, response.user.id)
            .putString(KEY_USER_EMAIL, response.user.email)
            .apply()
    }

    fun getSavedEmail(): String? = prefs.getString(KEY_USER_EMAIL, null)
}
