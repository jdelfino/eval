/**
 * Regression test: the Centrifugo config must declare a `section` namespace.
 *
 * Contract verified: both the local `centrifugo.json` and the prod Terraform
 * centrifugo module declare a `section` namespace alongside `session`.
 *
 * Why it matters (G4 section-pointer model): the section:{id} channel carries
 * `section_current_changed`, which drives the student late-join landing card and
 * the "Instructor moved on" banner. Centrifugo derives a channel's namespace
 * from the part before the first ":". With no `section` namespace declared,
 * Centrifugo silently rejects every section:{id} subscription — the client
 * connects, fetches a valid token, but never reaches the "subscribed" state, so
 * the entire pointer realtime path is dead with no error surfaced.
 *
 * What breaks if violated: the moved-on banner never appears and the section
 * live card never updates in real time (regressions are invisible without E2E).
 * This test fails against the buggy config (only `session` declared) and passes
 * once `section` is added.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CENTRIFUGO_JSON = path.join(REPO_ROOT, 'centrifugo.json');
const CENTRIFUGO_TF = path.join(
  REPO_ROOT,
  'infrastructure/terraform/modules/centrifugo/main.tf'
);

describe('Centrifugo namespaces', () => {
  it('local centrifugo.json declares both session and section namespaces', () => {
    const config = JSON.parse(fs.readFileSync(CENTRIFUGO_JSON, 'utf8')) as {
      namespaces?: Array<{ name: string }>;
    };
    const names = (config.namespaces ?? []).map((n) => n.name);
    expect(names).toContain('session');
    expect(names).toContain('section');
  });

  it('prod Terraform centrifugo module declares the section namespace', () => {
    const tf = fs.readFileSync(CENTRIFUGO_TF, 'utf8');
    // The namespaces block lists objects with `name = "..."`. Both the session
    // (pre-existing) and section (G4) namespaces must be present.
    expect(tf).toMatch(/name\s*=\s*"session"/);
    expect(tf).toMatch(/name\s*=\s*"section"/);
  });
});
