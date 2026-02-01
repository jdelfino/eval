const STORAGE_KEY = 'lastUsedSection';

interface LastUsedSection {
  sectionId: string;
  classId: string;
}

export function getLastUsedSection(): LastUsedSection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastUsedSection;
    if (parsed.sectionId && parsed.classId) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function setLastUsedSection(sectionId: string, classId: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ sectionId, classId }));
}
