import { describe, expect, it } from "vitest";
import { calculateAgeFromBirthDate, parseResidentNumber } from "@/lib/personIdentity";

describe("person identity helpers", () => {
  const today = new Date(2026, 10, 23);

  it("derives birth date, gender, and age from a resident number", () => {
    expect(parseResidentNumber("900101-2000000", today)).toEqual({
      birthDate: "1990-01-01",
      gender: "여성",
      age: 36,
    });
    expect(parseResidentNumber("051123-3000000", today)).toEqual({
      birthDate: "2005-11-23",
      gender: "남성",
      age: 21,
    });
  });

  it("returns no automatic values for incomplete or invalid resident numbers", () => {
    expect(parseResidentNumber("900101-2", today)).toBeNull();
    expect(parseResidentNumber("901332-2000000", today)).toBeNull();
  });

  it("calculates age from a manually entered birth date", () => {
    expect(calculateAgeFromBirthDate("1990-12-01", today)).toBe(35);
    expect(calculateAgeFromBirthDate("1990-01-01", today)).toBe(36);
  });
});
