const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ALLOWED_STATUS_TRANSITIONS = {
  Pending: ["Pending", "Confirmed", "Completed", "Cancelled"],
  Confirmed: ["Confirmed", "Completed", "Cancelled"],
  Completed: ["Completed"],
  Cancelled: ["Cancelled"],
};

function isValidEmail(email) {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim());
}

function isValidPhone(phone) {
  if (typeof phone !== "string" && typeof phone !== "number") return false;
  const str = String(phone).trim();
  if (!/^\+?[0-9\s()-]+$/.test(str)) return false;
  const digits = str.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function getStartOfTodayUTC() {
  const todayStr = new Date().toISOString().split("T")[0];
  return new Date(`${todayStr}T00:00:00.000Z`);
}

function parseStrictDateUTC(value) {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const str = value.toISOString().split("T")[0];
    return new Date(`${str}T00:00:00.000Z`);
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }
    return parsed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const dateStr = parsed.toISOString().split("T")[0];
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function isAllowedStatusTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(nextStatus);
}

function isValidDoctorImage(image) {
  if (image === undefined || image === null || image === "") return true;
  if (typeof image !== "string") return false;

  const trimmed = image.trim();
  if (!trimmed) return true;

  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

module.exports = {
  isValidEmail,
  isValidPhone,
  getStartOfTodayUTC,
  parseStrictDateUTC,
  isAllowedStatusTransition,
  isValidDoctorImage,
};
