const nodemailer = require("nodemailer");

let cachedTestAccount = null;

function hasSmtpCredentials() {
  const { EMAIL_USER, EMAIL_PASS } = process.env;
  return (
    Boolean(EMAIL_USER && EMAIL_PASS) &&
    EMAIL_USER !== "your_email@example.com" &&
    EMAIL_PASS !== "your_app_password"
  );
}

async function createSmtpTransporter() {
  const { EMAIL_SERVICE, EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE, EMAIL_USER, EMAIL_PASS } =
    process.env;

  if (EMAIL_HOST) {
    return nodemailer.createTransport({
      host: EMAIL_HOST,
      port: Number(EMAIL_PORT) || 587,
      secure: EMAIL_SECURE === "true",
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });
  }

  return nodemailer.createTransport({
    service: EMAIL_SERVICE || "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
}

function buildOtpMailOptions({ from, to, otp }) {
  return {
    from,
    to,
    subject: "MediCore Patient Login - Your 6-Digit OTP",
    text: `Your MediCore verification code is ${otp}. This OTP will expire in 5 minutes. Do not share it with anyone.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #eee8df; border-radius: 12px; background-color: #fcfbf9;">
        <h2 style="color: #172b3a; margin-top: 0;">MediCore Healthcare</h2>
        <p style="color: #4b5563; font-size: 15px;">Use the following 6-digit One-Time Password (OTP) to sign in to your Patient Portal:</p>
        <div style="margin: 24px 0; padding: 16px; text-align: center; background-color: #172b3a; color: #ffffff; font-size: 28px; font-weight: bold; letter-spacing: 6px; border-radius: 8px;">
          ${otp}
        </div>
        <p style="color: #6b7280; font-size: 13px;">This code is valid for <strong>5 minutes</strong>. If you did not request this login, please ignore this email.</p>
      </div>
    `,
  };
}

async function sendMockMail(mailOptions) {
  const mockTransporter = nodemailer.createTransport({ jsonTransport: true });
  const info = await mockTransporter.sendMail(mailOptions);
  return {
    messageId: info.messageId,
    mode: "mock",
    previewUrl: null,
  };
}

async function sendOtpEmail({ to, otp }) {
  const from =
    process.env.EMAIL_FROM ||
    process.env.EMAIL_USER ||
    "MediCore Healthcare <no-reply@medicore.local>";

  const mailOptions = buildOtpMailOptions({ from, to, otp });

  // Explicit mock mode for tests/local dev
  if (process.env.EMAIL_MOCK === "true") {
    return sendMockMail(mailOptions);
  }

  // Real SMTP mode when credentials are configured in .env
  if (hasSmtpCredentials()) {
    const transporter = await createSmtpTransporter();
    const info = await transporter.sendMail(mailOptions);
    return {
      messageId: info.messageId,
      mode: "smtp",
      previewUrl: null,
    };
  }

  // Test mode when SMTP credentials are not configured yet: try Ethereal, fall back to mock transport
  try {
    if (!cachedTestAccount) {
      cachedTestAccount = await nodemailer.createTestAccount();
    }

    const etherealTransporter = nodemailer.createTransport({
      host: cachedTestAccount.smtp.host,
      port: cachedTestAccount.smtp.port,
      secure: cachedTestAccount.smtp.secure,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      auth: {
        user: cachedTestAccount.user,
        pass: cachedTestAccount.pass,
      },
    });

    const info = await etherealTransporter.sendMail(mailOptions);
    return {
      messageId: info.messageId,
      mode: "ethereal",
      previewUrl: nodemailer.getTestMessageUrl(info),
    };
  } catch (etherealError) {
    console.warn(
      "Ethereal SMTP unavailable, using local mock email transport:",
      etherealError.message
    );
    return sendMockMail(mailOptions);
  }
}

module.exports = {
  sendOtpEmail,
};
