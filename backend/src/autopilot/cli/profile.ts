import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closeDb } from '../shared/db.js';
import { env, roles } from '../shared/env.js';
import { log } from '../shared/log.js';
import { readResume, workOutProfile, saveProfile } from '../autopilot/profile.js';

/**
 * Builds the owner's master profile from resume.txt — no questions asked.
 * The reading and the rules live in src/autopilot/profile.ts, which the web app
 * uses too, so a profile made here and one made on the site are the same thing.
 */

const candidateResume = [
  new URL('../../../resume.txt', import.meta.url),
  new URL('../../resume.txt', import.meta.url),
  new URL('../resume.txt', import.meta.url),
];
const resumePath = candidateResume.find((u) => fs.existsSync(fileURLToPath(u))) ?? candidateResume[0];
const resume = fs.existsSync(fileURLToPath(resumePath)) ? await readFile(resumePath, 'utf8') : '';

const facts = await readResume(resume);
const profile = workOutProfile(facts, resume, {
  extraRoles: roles,
  neverContact: (env.CURRENT_EMPLOYER ?? '').split(',').map((s) => s.trim()).filter(Boolean),
});

// The owner's row predates per-person accounts, so it is still keyed by its slug.
await saveProfile({ userId: null, slug: 'me' }, profile);

log.info({
  name: profile.fullName,
  where: `${profile.city}, ${profile.country}`,
  targetRoles: profile.targetRoles,
  seniority: profile.seniority,
  years: profile.years,
  degree: `${profile.degree} · ${profile.degreeLevel} · ${profile.gradYear}`,
  salaryFloor: profile.salaryFloor ?? 'not in the resume',
  skipIfItAsksForMoreThan: `${profile.knockouts.maxYearsAsked} years`,
  skipIfItDemands: profile.knockouts.degreeLevelsThatFail,
  neverContact: profile.neverContact,
}, 'profile saved from your resume');

await closeDb();
