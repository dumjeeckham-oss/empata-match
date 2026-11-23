export type ResidentNumberDetails = {
  birthDate: string;
  gender: "남성" | "여성";
  age: number;
};

function toLocalDate(value: string): Date | null {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)
    ? date
    : null;
}

export function calculateAgeFromBirthDate(birthDate: string, now = new Date()): number {
  const date = toLocalDate(birthDate);
  if (!date) return 0;

  let age = now.getFullYear() - date.getFullYear();
  const birthdayPassed = now.getMonth() > date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate());
  if (!birthdayPassed) age -= 1;
  return Math.max(age, 0);
}

/** 주민번호 앞 6자리와 뒤 7번째 숫자를 이용해 생년월일·성별·만 나이를 계산한다. */
export function parseResidentNumber(value: string, now = new Date()): ResidentNumberDetails | null {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 13) return null;

  const yearPart = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  const marker = Number(digits[6]);
  if (!Number.isInteger(marker) || marker < 0 || marker > 9) return null;

  const century = [9, 0].includes(marker) ? 1800 : [1, 2, 5, 6].includes(marker) ? 1900 : 2000;
  const year = century + yearPart;
  const birthDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!toLocalDate(birthDate)) return null;

  return {
    birthDate,
    gender: marker % 2 === 1 ? "남성" : "여성",
    age: calculateAgeFromBirthDate(birthDate, now),
  };
}
