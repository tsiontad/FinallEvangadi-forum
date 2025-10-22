const sgMail = require("@sendgrid/mail");
const dotenv = require("dotenv");
dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async (to, subject, html) => {
  try {
    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL, // Must be verified on SendGrid
      subject,
      html,
    };

    const info = await sgMail.send(msg);
    console.log("Email sent successfully to:", to);
    return info;
  } catch (error) {
    console.error("SendGrid Error:", error.response?.body || error);
    throw new Error("Failed to send email");
  }
};

module.exports = sendEmail;
