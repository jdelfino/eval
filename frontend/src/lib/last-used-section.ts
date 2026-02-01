const STORAGE_KEY = 'lastUsedSection';

interface LastUsedSection {
  section_id: string;
  class_id: string;
}

export function getLastUsedSection(): LastUsedSection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastUsedSection;
    if (parsed.section_id && parsed.class_id) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function setLastUsedSection(section_id: string, class_id: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ section_id, class_id }));
}
