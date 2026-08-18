const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // TLS from start (good for OTP use)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((err, success) => {
  if (err) {
    // console.error("SMTP VERIFY ERROR:", err);
  } else {
    console.log("SMTP READY");
  }
});

module.exports = transporter;
