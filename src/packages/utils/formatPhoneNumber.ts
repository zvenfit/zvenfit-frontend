export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length !== 11) {
    return phoneNumber; // Возвращаем исходную строку, если она некорректна
  }

  const cleanedPhoneNumber = phoneNumber.replace(/\D/g, ''); // Удаляем все нецифровые символы

  return `+${cleanedPhoneNumber.slice(0, 1)} (${cleanedPhoneNumber.slice(1, 4)}) ${cleanedPhoneNumber.slice(4, 7)}-${cleanedPhoneNumber.slice(7, 9)}-${cleanedPhoneNumber.slice(9)}`;
}
