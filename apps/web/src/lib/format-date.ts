export function formatDate(date: Date): string {
  const today = new Date();
  const year = today.getFullYear();
  const dateYear = date.getFullYear();

  // Check if the date is today
  if (date.toDateString() === today.toDateString()) {
    // Return time in 24:60 format
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  // Check if the date is within the current week
  const firstDayOfWeek = new Date(
    today.setDate(today.getDate() - today.getDay()),
  );
  const lastDayOfWeek = new Date(firstDayOfWeek);
  lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
  if (date >= firstDayOfWeek && date <= lastDayOfWeek) {
    // Return weekday in short format (e.g., Mon, Tue, etc.)
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return weekdays[date.getDay()];
  }

  // Check if the date is in the current year
  if (dateYear === year) {
    // Return date in 'MMM dd' format (e.g., Mar 20, Jul 17)
    const month = date.toLocaleString("default", { month: "short" });
    const day = date.getDate();
    return `${month} ${day}`;
  }

  // Otherwise, return the date in 'MM/DD/YYYY' format
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const fullYear = date.getFullYear();
  return `${month}/${day}/${fullYear}`;
}
