import type { Worker } from "@/types";

export type WorkerTimeBand = "오전" | "오후";

export interface WorkerSearchFilters {
  genders: string[];
  minAge?: number;
  maxAge?: number;
  timeBands: WorkerTimeBand[];
  canSupportDiaper: boolean;
  noAnimalAllergy: boolean;
  canSupportAdults: boolean;
  canSupportMaleUsers: boolean;
}

export function calculateAge(birthDate: unknown, asOf = new Date()): number | null {
  const value = String(birthDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birth = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > asOf) return null;
  let age = asOf.getFullYear() - birth.getFullYear();
  const beforeBirthday = asOf.getMonth() < birth.getMonth() || (asOf.getMonth() === birth.getMonth() && asOf.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function scheduleBands(worker: Worker): Set<WorkerTimeBand> {
  const bands = new Set<WorkerTimeBand>();
  for (const day of worker.weeklySchedule || []) {
    for (const slot of day.slots || []) bands.add(slot < 24 ? "오전" : "오후");
  }
  const text = String(worker.availableHours || "");
  if (/종일|하루종일|all\s*day/i.test(text)) {
    bands.add("오전");
    bands.add("오후");
  }
  if (/오전|morning|아침/i.test(text)) bands.add("오전");
  if (/오후|afternoon|저녁/i.test(text)) bands.add("오후");
  const times = [...text.matchAll(/(\d{1,2})(?::(\d{2}))?/g)].map((match) => Number(match[1]) + Number(match[2] || 0) / 60).filter((value) => value >= 0 && value <= 24);
  if (times.length >= 2) {
    if (Math.min(...times) < 12) bands.add("오전");
    if (Math.max(...times) > 12) bands.add("오후");
  }
  return bands;
}

export function matchesWorkerFilters(worker: Worker, filters: WorkerSearchFilters, asOf = new Date()): boolean {
  if (filters.genders.length > 0 && !filters.genders.includes(worker.gender || worker.txtHSex || "")) return false;
  const ageFilterActive = filters.minAge !== undefined || filters.maxAge !== undefined;
  if (ageFilterActive) {
    const age = calculateAge(worker.birthDate, asOf);
    if (age === null || (filters.minAge !== undefined && age < filters.minAge) || (filters.maxAge !== undefined && age > filters.maxAge)) return false;
  }
  if (filters.timeBands.length > 0) {
    const bands = scheduleBands(worker);
    if (!filters.timeBands.some((band) => bands.has(band))) return false;
  }
  if (filters.canSupportDiaper && worker.canSupportDiaper !== true) return false;
  if (filters.noAnimalAllergy && (worker.animalAllergy !== false || !Object.prototype.hasOwnProperty.call(worker, "animalAllergy"))) return false;
  if (filters.canSupportAdults && worker.canSupportAdults !== true) return false;
  if (filters.canSupportMaleUsers && worker.canSupportMaleUsers !== true) return false;
  return true;
}
