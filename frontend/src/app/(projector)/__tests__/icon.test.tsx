import fs from 'fs';
import path from 'path';

describe('Projector favicon', () => {
  it('should have an icon.svg file', () => {
    const iconPath = path.join(__dirname, '..', 'icon.svg');
    expect(fs.existsSync(iconPath)).toBe(true);
  });

  it('should be valid SVG with green gradient', () => {
    const iconPath = path.join(__dirname, '..', 'icon.svg');
    const content = fs.readFileSync(iconPath, 'utf-8');
    expect(content).toContain('<svg');
    expect(content).toContain('#38b2ac'); // teal
    expect(content).toContain('#2f855a'); // green
  });
});
