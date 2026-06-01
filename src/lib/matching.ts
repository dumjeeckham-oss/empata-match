import { type ServiceUser, type Worker, type MatchResult } from "@/types";
import { calculateDistance } from "@/lib/kakao";

function parseTimeSlots(timeStr: string): string[] {
  if (!timeStr) return [];
  return String(timeStr || "").split(",").map((s) => String(s || "").trim().toLowerCase());
}

function parseDays(dayStr: string): string[] {
  if (!dayStr) return [];
  return String(dayStr || "").split(",").map((s) => String(s || "").trim());
}

function timeOverlapScore(userDays: string, userHours: string, workerDays: string, workerHours: string): number {
  const uDays = parseDays(userDays);
  const wDays = parseDays(workerDays);
  const dayOverlap = uDays.filter((d) => wDays.includes(d)).length;
  const dayScore = uDays.length > 0 ? dayOverlap / uDays.length : 0;

  const uHours = parseTimeSlots(userHours);
  const wHours = parseTimeSlots(workerHours);
  const hourOverlap = uHours.filter((h) => wHours.some((wh) => wh.includes(h) || h.includes(wh))).length;
  const hourScore = uHours.length > 0 ? hourOverlap / uHours.length : 0.5;

  return (dayScore * 0.6 + hourScore * 0.4) * 40;
}

function locationScore(user: ServiceUser, worker: Worker): { score: number; distanceKm: number | null } {
  if (user.lat && user.lng && worker.lat && worker.lng) {
    const dist = calculateDistance(user.lat, user.lng, worker.lat, worker.lng);
    if (dist <= 1) return { score: 30, distanceKm: dist };
    if (dist <= 3) return { score: 25, distanceKm: dist };
    if (dist <= 5) return { score: 20, distanceKm: dist };
    if (dist <= 10) return { score: 10, distanceKm: dist };
    return { score: 0, distanceKm: dist };
  }
  // Fallback: text-based area matching
  if (worker.preferredArea && user.address) {
    const match = user.address.includes(worker.preferredArea) || worker.preferredArea.includes(user.address.substring(0, 5));
    return { score: match ? 20 : 5, distanceKm: null };
  }
  return { score: 5, distanceKm: null };
}

function preferenceScore(user: ServiceUser, worker: Worker): number {
  if (!user.preferredWorkerTraits) return 10;
  const prefs = user.preferredWorkerTraits.toLowerCase();
  let score = 10;
  if (prefs.includes("여성") && worker.gender === "여성") score += 5;
  if (prefs.includes("남성") && worker.gender === "남성") score += 5;
  if (prefs.includes("운전") && worker.canDrive) score += 5;
  if (prefs.includes("경력") && worker.experience !== "경력없음" && worker.experience !== "1년 미만") score += 5;
  return Math.min(score, 20);
}

function rejectionPenalty(user: ServiceUser, worker: Worker): number {
  let penalty = 0;
  const rejections = worker.rejectionTypes || [];
  if (rejections.includes("성인거부") && user.age >= 19) penalty += 100;
  if (rejections.includes("남성거부") && user.gender === "남성") penalty += 100;
  if (rejections.includes("여성거부") && user.gender === "여성") penalty += 100;
  if (rejections.includes("흡연자거부") && user.environmentTags?.includes("흡연")) penalty += 100;
  if (rejections.includes("반려동물거부") && user.environmentTags?.includes("반려동물")) penalty += 100;
  if (rejections.includes("와상거부") && user.environmentTags?.includes("와상")) penalty += 100;
  if (rejections.includes("기저귀거부") && user.environmentTags?.includes("기저귀")) penalty += 100;
  if (worker.animalAllergy && user.environmentTags?.includes("반려동물")) penalty += 50;
  return penalty;
}

export function matchUserWithWorkers(user: ServiceUser, workers: Worker[]): MatchResult[] {
  const availableWorkers = workers.filter((w) => w.contractStatus !== "퇴사");

  return availableWorkers
    .map((worker) => {
      const timeScore = timeOverlapScore(user.requiredDays, user.requiredHours, worker.availableDays, worker.availableHours);
      const loc = locationScore(user, worker);
      const prefScore = preferenceScore(user, worker);
      const penalty = rejectionPenalty(user, worker);
      const score = Math.max(0, timeScore + loc.score + prefScore - penalty);
      return {
        worker,
        score,
        details: {
          timeScore,
          locationScore: loc.score,
          preferenceScore: prefScore,
          rejectionPenalty: penalty,
          distanceKm: loc.distanceKm,
        },
      };
    })
    .filter((r) => r.details.rejectionPenalty < 100)
    .sort((a, b) => b.score - a.score);
}
