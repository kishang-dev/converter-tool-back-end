function parsePDFDate(dateString) {
  if (!dateString) return null;

  try {
    let cleanDateString = dateString.toString().replace(/^D:/, "");
    let date = new Date(cleanDateString);

    if (isNaN(date.getTime())) {
      const match = cleanDateString.match(
        /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/
      );
      if (match) {
        const [, year, month, day, hour = "00", minute = "00", second = "00"] =
          match;
        date = new Date(
          parseInt(year),
          parseInt(month) - 1, // Month is 0-indexed
          parseInt(day),
          parseInt(hour),
          parseInt(minute),
          parseInt(second)
        );
      }
    }
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    console.warn(
      "Date parsing error for:",
      dateString,
      "Error:",
      error.message
    );
    return null;
  }
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = {
  parsePDFDate,
  escapeHtml,
};
