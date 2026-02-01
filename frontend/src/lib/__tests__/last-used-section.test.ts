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

    it('returns stored section_id and class_id', () => {
      localStorage.setItem('lastUsedSection', JSON.stringify({ section_id: 'sec-1', class_id: 'class-1' }));
      expect(getLastUsedSection()).toEqual({ section_id: 'sec-1', class_id: 'class-1' });
    });

    it('returns null for invalid JSON', () => {
      localStorage.setItem('lastUsedSection', 'not-json');
      expect(getLastUsedSection()).toBeNull();
    });
  });

  describe('setLastUsedSection', () => {
    it('stores section_id and class_id', () => {
      setLastUsedSection('sec-1', 'class-1');
      expect(JSON.parse(localStorage.getItem('lastUsedSection')!)).toEqual({
        section_id: 'sec-1',
        class_id: 'class-1',
      });
    });
  });
});
