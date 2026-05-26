package com.example.enrollmentapp

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class LoginActivity : AppCompatActivity() {

    private lateinit var usernameInput: EditText
    private lateinit var passwordInput: EditText
    private lateinit var loginButton: Button
    private lateinit var errorText: TextView

    private val VALID_USERNAME = "Letsbunk"
    private val VALID_PASSWORD = "aditya"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("app_prefs", MODE_PRIVATE)
        val isLoggedIn = prefs.getBoolean("is_logged_in", false)
        val loginDate = prefs.getString("login_date", "")
        val currentDate = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

        if (isLoggedIn && loginDate == currentDate) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }

        setContentView(R.layout.activity_login)

        usernameInput = findViewById(R.id.usernameInput)
        passwordInput = findViewById(R.id.passwordInput)
        loginButton   = findViewById(R.id.loginButton)
        errorText     = findViewById(R.id.errorText)

        loginButton.setOnClickListener {
            val username = usernameInput.text.toString().trim()
            val password = passwordInput.text.toString()

            if (username.isEmpty() || password.isEmpty()) {
                showError("Please enter username and password")
                return@setOnClickListener
            }

            if (username == VALID_USERNAME && password == VALID_PASSWORD) {
                // Correct credentials — save login state and date, then go to main screen
                prefs.edit().apply {
                    putBoolean("is_logged_in", true)
                    putString("login_date", currentDate)
                    apply()
                }
                startActivity(Intent(this, MainActivity::class.java))
                finish()
            } else {
                showError("Invalid username or password")
                passwordInput.text.clear()
            }
        }

        // Allow login on keyboard "Done" action
        passwordInput.setOnEditorActionListener { _, _, _ ->
            loginButton.performClick()
            true
        }
    }

    private fun showError(message: String) {
        errorText.text = message
        errorText.visibility = View.VISIBLE
    }
}
