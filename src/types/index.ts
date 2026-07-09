export const VOUCHER_HOURS: Record<number, number> = {
  1: 470, 2: 440, 3: 410, 4: 380, 5: 360, 6: 330, 7: 300,
  8: 270, 9: 240, 10: 210, 11: 180, 12: 150, 13: 120, 14: 90, 15: 60,
};

export const DISABILITY_TYPES = [
  "지체장애", "뇌병변장애", "시각장애", "청각장애", "언어장애",
  "지적장애", "자폐성장애", "정신장애", "신장장애", "심장장애",
  "호흡기장애", "간장애", "안면장애", "장루·요루장애", "뇌전증장애",
] as const;

export const SUPPORT_TYPES = ["사회지원", "신체지원", "가사지원"] as const;
export const ENVIRONMENT_TAGS = ["기저귀", "반려동물", "흡연", "와상", "차량필요"] as const;

export const WORKER_REJECTION_TYPES = [
  "성인거부", "남성거부", "여성거부", "흡연자거부", "반려동물거부",
  "와상거부", "기저귀거부", "요리거부",
] as const;

export const EXPERIENCE_OPTIONS = [
  "경력없음", "1년 미만", "1년", "2년", "3년", "4년", "5년 이상"
] as const;

export const TERMINATION_REASONS = [
  "사망", "이용자퇴소", "기관변경", "타서비스전환",
  "품목변경", "법령변경기인임", "시설변경", "가족희망",
  "개인사정", "기타",
] as const;

export interface WeeklySchedule {
  day: "월" | "화" | "수" | "목" | "금" | "토" | "일";
  slots: number[]; // 0-47 (30분 단위, 00:00 = 0)
}

export interface ServiceUser {
  id?: string;
  name: string;
  age: number;
  gender: string;
  /** Excel/Firebase 원본 필드 호환: 이용자 성별 */
  txtUSex?: string;
  phone: string;
  disabilityType: string;
  voucherTier: number;
  requiredDays: string;
  requiredHours: string;
  weeklySchedule?: WeeklySchedule[];
  supportTypes: string[];
  environmentTags: string[];
  familyMembers: string;
  address: string;
  lat?: number;
  lng?: number;
  hasPet: boolean;
  petNote?: string;
  livingWith: string; // 거주자
  movementNote?: string; // 이동시 유의점
  houseworkNote?: string; // 가사지원시 유의점
  needsVehicle: boolean; // 차량필요 여부
  usesDiaper: boolean; // 기저귀 여부
  preferredWorkerTraits: string; // 희망 활동지원사 선호도
  notes: string;
  needsAftercare?: boolean; // 배변뒤처리 필요
  wantsWeekendSupport?: boolean; // 주말지원 희망
  femaleOnly?: boolean; // 여성만 원함
  maleOnly?: boolean; // 남성만 원함
  contractStatus: "서비스중" | "계약해지" | "대기" | "타기관 계약" | "보류";
  serviceStartDate: string;
  /** 계약해지 날짜 (resignationDate) */
  resignationDate: string;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  /** 중단/해지 사유 (txtUMemostop) */
  terminationReason: string;
  /** Excel/Firebase 원본 필드 호환: 중단/해지 사유 */
  txtUMemostop?: string;
  /** Firestore 업무 필드: 담당 활동지원사 ID 배열 */
  assigned_workers?: string[];
  /** 담당 활동지원사 ID 목록 (N:M) */
  assignedHelperIds: string[];
  /** 담당 활동지원사 이름 목록 */
  assignedHelperNames: string[];
  /** 담당 활동지원사 연락처 목록 */
  assignedHelperPhones: string[];
  receiptDate: string; // 최초 접수일
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Worker {
  id?: string;
  name: string;
  age: number;
  gender: string;
  /** Excel/Firebase 원본 필드 호환: 활동지원사 성별 */
  txtHSex?: string;
  phone: string;
  residenceArea: string;
  preferredArea: string;
  address: string;
  lat?: number;
  lng?: number;
  experience: string;
  availableDays: string;
  availableHours: string;
  weeklySchedule?: WeeklySchedule[];
  supportTypes: string[]; // 지원 가능 종류
  rejectionTypes: string[];
  rejectedTasks: string;
  canDrive: boolean;
  animalAllergy: boolean;
  isForeigner?: boolean;
  hasF4?: boolean;
  hasF5?: boolean;
  certificates: string[]; // 보유 자격증
  certificateNumber: string;
  contractStatus: "근무중" | "퇴사" | "대기";
  serviceStartDate: string;
  resignationDate: string;
  notes: string;
  /** 담당 이용자 ID 목록 (N:M) */
  assignedUserIds: string[];
  /** Firestore 업무 필드: 담당 이용자 ID 배열 */
  assigned_users?: string[];
  /** 담당 이용자 이름 목록 */
  assignedUserNames: string[];
  /** 담당 이용자 연락처 목록 */
  assignedUserPhones: string[];
  receiptDate: string; // 최초 접수일
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CounselingRecord {
  id?: string;
  targetType: "이용자" | "활동지원사";
  targetId: string;
  targetName: string;
  counselorName: string;
  date: string;
  content: string;
  category: string;
  createdAt?: unknown;
}

export interface TerminationDocument {
  id?: string;
  userId: string;
  userName: string;
  userPhone: string;
  date: string;
  reasons: string[];
  reasonDetail: string;
  handoverNote?: string;
  approverDandang?: string;
  approverCenterJang?: string;
  /** 사업명 (종결승인서) */
  projectName?: string;
  /** 주민등록번호 (종결승인서) */
  residentNumber?: string;
  /** 결재일 (종결승인서) */
  approvalDate?: string;
  /** 담당 활동지원사명 (자동 채움) */
  assignedWorkerName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface HandoverDocument {
  id?: string;
  userId: string;
  userName: string;
  userPhone: string;
  userAddress: string;
  voucherTier: number;
  disabilityType: string;
  reason: string;
  handoverPersonName: string;
  handoverDate: string;
  takeoverPersonName: string;
  takeoverDate: string;
  prevWorkerId?: string;
  prevWorkerName?: string;
  prevWorkerPhone?: string;
  nextWorkerId?: string;
  nextWorkerName?: string;
  nextWorkerPhone?: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MatchResult {
  worker: Worker;
  score: number;
  details: {
    timeScore: number;
    locationScore: number;
    preferenceScore: number;
    rejectionPenalty: number;
    distanceKm: number | null;
  };
}

export interface MatchingHistoryRecord {
  id?: string;
  type: "배정" | "해제" | "시도";
  userId: string;
  userName: string;
  userPhone: string;
  workerId: string;
  workerName: string;
  workerPhone: string;
  date: string; // YYYY-MM-DD
  notes?: string;
  createdAt?: unknown;
}
