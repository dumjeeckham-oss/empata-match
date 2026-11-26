import type { ServiceUser, TerminationDocument } from "@/types";

const legacyKey = (name: string, phone: string) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return name && digits ? JSON.stringify([name, digits]) : "";
};

/** ID가 없는 이전 문서는 이름과 연락처의 조합이 유일할 때만 연결한다. */
export function indexTerminationHistory(users: ServiceUser[], documents: TerminationDocument[]): Map<string, TerminationDocument[]> {
  const result = new Map<string, TerminationDocument[]>();
  const legacyUsers = new Map<string, string[]>();
  for (const user of users) {
    const key = legacyKey(user.name, user.phone);
    if (key && user.id) legacyUsers.set(key, [...(legacyUsers.get(key) || []), user.id]);
  }
  for (const document of documents) {
    const candidates = legacyUsers.get(legacyKey(document.userName, document.userPhone)) || [];
    const userId = document.userId || (candidates.length === 1 ? candidates[0] : "");
    if (userId) result.set(userId, [...(result.get(userId) || []), document]);
  }
  for (const history of result.values()) history.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return result;
}
