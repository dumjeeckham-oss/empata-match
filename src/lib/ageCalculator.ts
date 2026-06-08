/**
 * 생년월일 또는 출생연도를 기반으로 현재 나이를 계산합니다.
 * 데이터베이스에 저장된 값이 생년월일(YYYY-MM-DD) 또는 출생연도(YYYY)인 경우 모두 처리합니다.
 * 
 * @param birthValue - 생년월일(YYYY-MM-DD) 또는 출생연도(YYYY) 또는 나이(숫자)
 * @returns 현재 날짜 기준 계산된 나이
 */
export function calculateAge(birthValue: string | number | undefined): number {
  if (!birthValue) return 0;

  const birthStr = String(birthValue).trim();
  
  // 숫자만 있는 경우 (이미 나이이거나 출생연도)
  if (/^\d+$/.test(birthStr)) {
    const num = Number(birthStr);
    
    // 1900 이상 2100 미만 = 출생연도로 간주
    if (num >= 1900 && num < 2100) {
      const currentYear = new Date().getFullYear();
      return currentYear - num;
    }
    
    // 그 외 = 이미 나이
    return num;
  }

  // YYYY-MM-DD 형식 처리
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthStr)) {
    const [yearStr, monthStr, dayStr] = birthStr.split('-');
    const birthYear = Number(yearStr);
    const birthMonth = Number(monthStr);
    const birthDay = Number(dayStr);

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();

    let age = currentYear - birthYear;

    // 생일이 아직 오지 않았으면 -1
    if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
      age--;
    }

    return Math.max(0, age);
  }

  // 다른 형식은 0 반환
  return 0;
}

/**
 * 서비스 이용자 또는 활동지원사 객체에서 나이를 실시간으로 계산하여 반환합니다.
 * 기존 age 필드를 무시하고 생년월일이나 출생연도에서 계산합니다.
 * 
 * @param entity - ServiceUser 또는 Worker 객체
 * @returns 계산된 나이
 */
export function getRealtimeAge(entity: { age?: number; birthDate?: string; birthYear?: number }): number {
  // birthDate 필드가 있으면 우선 사용
  if (entity.birthDate) {
    return calculateAge(entity.birthDate);
  }

  // birthYear 필드가 있으면 사용
  if (entity.birthYear) {
    return calculateAge(entity.birthYear);
  }

  // age 필드가 있으면 사용 (하지만 이는 고정값이므로 권장하지 않음)
  return entity.age || 0;
}
