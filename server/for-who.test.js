import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanForWho, forWhoOf, inferForWho } from './for-who.js';
import { importScrapedJobs } from './jobfinder.js';
import { applyJob } from './jobs.js';

/* "For who" (founder, 2026-11-26): worker groups per role, worked out from the location / work mode. */
test('worked out from the location and work mode', () => {
  assert.deepEqual(inferForWho({ location: 'Ho Chi Minh City, Vietnam (must be based in HCMC)', workMode: 'Remote', remoteScope: 'worldwide' }), ['vn']);
  assert.deepEqual(inferForWho({ location: 'Quận 10, Hồ Chí Minh, VN' }), ['vn']);
  assert.deepEqual(inferForWho({ location: 'New York, NY' }), ['us']);
  assert.deepEqual(inferForWho({ location: 'Remote-Friendly, United States', workMode: 'Remote' }), ['us']);
  assert.deepEqual(inferForWho({ location: 'London, UK' }), ['eu']);
  assert.deepEqual(inferForWho({ location: 'Berlin, Germany' }), ['eu']);
  assert.deepEqual(inferForWho({ location: 'Remote', workMode: 'Remote', remoteScope: 'worldwide' }), ['remote']);
  assert.deepEqual(inferForWho({ location: 'Anywhere (fully remote)', workMode: 'Remote' }), ['remote']);
  assert.deepEqual(inferForWho({ location: 'Singapore' }), ['sg']);
  assert.deepEqual(inferForWho({ location: 'Somewhere' }), []);
  assert.deepEqual(inferForWho({ location: 'Somewhere' }, 'Vietnam'), ['vn'], 'the site region is only a hint');
  assert.deepEqual(inferForWho({ location: 'Customs agency' }), [], '"us" inside a word is not the US');
});

test('the recruiter choice wins; unknown codes are dropped; [] clears it', () => {
  assert.deepEqual(forWhoOf({ location: 'Hanoi', forWho: ['us', 'remote'] }), ['us', 'remote']);
  assert.deepEqual(cleanForWho(['vn', 'mars', 'vn']), ['vn']);
  const job = { forWho: ['vn'] };
  applyJob(job, { forWho: ['eu', 'nope'] }); assert.deepEqual(job.forWho, ['eu']);
  applyJob(job, { forWho: [] }); assert.equal(job.forWho, undefined);
});

test('scraped imports store For who, with the site region as a hint', () => {
  const db = { users: [{ id: 'jf1', role: 'employer', jobFinder: true }], jobs: [], swipes: [], matches: [] };
  const base = { format: 'jobsmatchnow-job/v1', company: 'Acme', description: 'x', source: { name: 'Site' } };
  const r = importScrapedJobs(db, [
    { ...base, title: 'Data Engineer', location: 'Hanoi, Vietnam', source: { url: 'https://a.example/jobs/12345' } },
    { ...base, title: 'ML Engineer', location: 'Confidential', workersFrom: 'EU / UK', source: { url: 'https://a.example/jobs/12346' } },
  ], { ownerId: 'jf1' });
  assert.deepEqual(db.jobs.find((j) => j.id === r[0].id).forWho, ['vn']);
  assert.deepEqual(db.jobs.find((j) => j.id === r[1].id).forWho, ['eu']);
});
