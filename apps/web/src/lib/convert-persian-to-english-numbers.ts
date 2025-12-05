export function convertPersianToEnglishNumbers(input: string): string {
  // Map of Persian digits to English digits
  const persianToEnglishMap: { [key: string]: string } = {
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",
    // Arabic variants sometimes used in Persian texts
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
  };

  // Replace each Persian/Arabic digit with its English equivalent
  return input.replace(
    /[۰-۹٠-٩]/g,
    (match) => persianToEnglishMap[match] || match,
  );
}
