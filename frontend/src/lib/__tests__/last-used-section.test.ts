/**
 * @jest-environment jsdom
 */
import { getLastUsedSection, setLastUsedSection } from '../last-used-section';

describe('last-used-section', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getLastUsedSection', () => {
    it('returns null when nothing is stored', () => {
      expect(getLastUsedSection()).toBeNull();
    });

    it('returns stored sectionId and classId', () => {
      localStorage.setItem('lastUsedSection', JSON.stringify({ sectionId: 'sec-1', classId: 'class-1' }));
      expect(getLastUsedSection()).toEqual({ sectionId: 'sec-1', classId: 'class-1' });
    });

    it('returns null for invalid JSON', () => {
      localStorage.setItem('lastUsedSection', 'not-json');
      expect(getLastUsedSection()).toBeNull();
    });
  });

  describe('setLastUsedSection', () => {
    it('stores sectionId and classId', () => {
      setLastUsedSection('sec-1', 'class-1');
      expect(JSON.parse(localStorage.getItem('lastUsedSection')!)).toEqual({
        sectionId: 'sec-1',
        classId: 'class-1',
      });
    });
  });
});
