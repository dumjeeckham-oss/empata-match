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
  "와상거부", "기저귀거부",
] as const;

export const EXPERIENCE_OPTIONS = [
  "경력없음", "1년 미만", "1년", "2년", "3년", "4년", "5년 이상"
] as const;

export const TERMINATION_REASONS = [
  "사망", "이중서비스", "기관변경", "타시도 전출",
  "등급변경", "병원장기입원", "사업변경", "가족합가",
  "개인사정", "기타",
] as const;

export interface ServiceUser {
  id?: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  disabilityType: string;
  voucherTier: number;
  requiredDays: string;
  requiredHours: string;
  supportTypes: string[];
  environmentTags: string[];
  familyMembers: string;
  address: string;
  lat?: number;
  lng?: number;
  preferredWorkerTraits: string;
  notes: string;
  contractStatus: "서비스중" | "계약해지" | "대기";
  serviceStartDate: string;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  /** 중단/해지 사유 (txtUMemostop) */
  terminationReason: string;
  /** 담당 활동지원사 ID 목록 (N:M) */
  assignedHelperIds: string[];
  /** 담당 활동지원사 이름 목록 */
  assignedHelperNames: string[];
  /** 담당 활동지원사 연락처 목록 */
  assignedHelperPhones: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface Worker {
  id?: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  residenceArea: string;
  preferredArea: string;
  address: string;
  lat?: number;
  lng?: number;
  experience: string;
  availableDays: string;
  availableHours: string;
  rejectionTypes: string[];
  rejectedTasks: string;
  canDrive: boolean;
  animalAllergy: boolean;
  certificateNumber: string;
  contractStatus: "근무중" | "퇴사" | "대기";
  serviceStartDate: string;
  resignationDate: string;
  notes: string;
  /** 담당 이용자 ID 목록 (N:M) */
  assignedUserIds: string[];
  /** 담당 이용자 이름 목록 */
  assignedUserNames: string[];
  /** 담당 이용자 연락처 목록 */
  assignedUserPhones: string[];
  createdAt?: any;
  updatedAt?: any;
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
  createdAt?: any;
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
