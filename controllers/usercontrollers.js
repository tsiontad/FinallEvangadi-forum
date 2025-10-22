// database connection
const dbconnection = require("../Database/databaseconfig");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/emailSender");

async function register(req, res) {
  const { username, firstname, lastname, email, user_password } = req.body;
  if (!username) {
    return res.status(400).json({ message: "Please Enter Your User Name" });
  }
  if (!firstname) {
    return res.status(400).json({ message: "Please Enter Your firstname" });
  }
  if (!lastname) {
    return res.status(400).json({ message: "Please Enter Your lastname" });
  }
  if (!email) {
    return res.status(400).json({ message: "Please Enter Your email" });
  }
  if (!user_password) {
    return res.status(400).json({ message: "Please Enter Your password" });
  }

  try {
    // Changed: ? → $1 and [rows] → { rows }
    const { rows: usernameValidation } = await dbconnection.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    const { rows: emailValidation } = await dbconnection.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (usernameValidation.length > 0) {
      return res
        .status(400)
        .json({ status: "Failed ", message: "Username Already Exists" });
    }

    if (emailValidation.length > 0) {
      return res
        .status(400)
        .json({ status: "Failed ", message: "Email Already in Use" });
    }

    if (user_password.length <= 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    }
    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(user_password, saltRounds);

    // Changed: ? → $1, $2, $3, $4, $5
    await dbconnection.query(
      "INSERT INTO users (username, firstname, lastname, email, user_password) VALUES ($1, $2, $3, $4, $5)",
      [username, firstname, lastname, email, hashedPassword]
    );
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function login(req, res) {
  const { email, user_password, rememberMe } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is empty" });
  }
  if (!user_password) {
    return res.status(400).json({ message: "password is empty" });
  }

  try {
    // Changed: ? → $1 and [rows] → { rows }
    const { rows } = await dbconnection.query(
      "SELECT username, userid, user_password FROM users WHERE email = $1",
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: "Invalid email or password" });
    }
    const user = rows[0];
    const passwordMatch = await bcrypt.compare(
      user_password,
      user.user_password
    );

    if (!passwordMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const username = rows[0].username;
    const userid = rows[0].userid;

    const expiresIn = rememberMe ? "30d" : "1d";

    const token = jwt.sign({ username, userid }, process.env.JWT_SECRET, {
      expiresIn: expiresIn,
    });

    return res.status(200).json({
      msg: "user login successful",
      token,
      username,
      userid,
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function checkuser(req, res) {
  const username = req.user.username;
  const userid = req.user.userid;
  res.json({ message: "user is logged in", username, userid });
}

// ------------------- Forgot Password -------------------
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    // Check if user exists - Changed: ? → $1 and [rows] → { rows }
    const { rows } = await dbconnection.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (rows.length === 0) {
      // Still return success - don't reveal email doesn't exist
      return res.status(200).json({
        message: "If that email exists, an OTP has been sent to your inbox",
      });
    }
    // Generate OTP
    const otp = Math.floor(10000000 + Math.random() * 90000000);
    const hashedOtp = await bcrypt.hash(otp.toString(), 10);

    // Save OTP + expiration (5 mins)
    // Changed: DATE_ADD(NOW(), INTERVAL 5 MINUTE) → NOW() + INTERVAL '5 minutes'
    await dbconnection.query(
      "UPDATE users SET reset_otp = $1, otp_expiration = NOW() + INTERVAL '5 minutes' WHERE email = $2",
      [hashedOtp, email]
    );

    // Send OTP email
    try {
      await sendEmail(
        email,
        "Your Password Reset Code",
        `<p>Your OTP code is: <b>${otp}</b></p>
         <p>This code will expire in 5 minutes.</p>
         <p>If you didn't request this, please ignore this email.</p>`
      );
    } catch (emailErr) {
      console.error("Email sending failed:", emailErr);
      return res.status(500).json({ message: "Failed to send OTP email" });
    }
    return res.status(200).json({
      message: "If that email exists, an OTP has been sent to your inbox",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ------------------- Reset Password -------------------
const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: "All fields are required" });
  }
  console.log(email, otp);

  try {
    // Verify OTP - Changed: ? → $1 and [user] → { rows: user }
    const { rows: user } = await dbconnection.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    console.log(user);

    if (user.length === 0)
      return res.status(400).json({ message: "Invalid OTP" });

    const otpMatch = await bcrypt.compare(otp.toString(), user[0].reset_otp);
    const otpExpiration = new Date(user[0].otp_expiration);

    if (!otpMatch || otpExpiration < new Date()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear OTP - Changed: ? → $1, $2
    await dbconnection.query(
      "UPDATE users SET user_password = $1, reset_otp = NULL, otp_expiration = NULL WHERE email = $2",
      [hashedPassword, email]
    );

    res.json({ message: "Password reset successful! You can now login." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  register,
  login,
  checkuser,
  resetPassword,
  forgotPassword,
};
