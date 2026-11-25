import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResumeToProfile, rankSkills } from './resume-parse.js';

/* Founder, 2026-11-25: parse the resume better and sort the skillset (strongest first, real levels, cloud/data/AI). */
const CV = `Jane Nguyen
Cloud Data AI Infrastructure Engineer
SUMMARY
Hands-on architect with 8 years of experience. 6 years of AWS and 4 years with Kubernetes. I lead go-to-market workshops and go-live plans.
SKILLS
AWS, GCP, Azure, Kubernetes, Terraform, Python, Snowflake, Databricks, Airflow, LangChain, RAG, Postgres, k8s, Communication
EXPERIENCE
Lead Cloud Engineer at Acme 2021 - Present
Built a RAG platform on AWS Bedrock with LangChain and Python; Kubernetes on EKS; Terraform for all infra; Snowflake + dbt pipelines.
Data Engineer at Beta 2017 - 2021
Airflow and Spark pipelines on GCP BigQuery; Python everywhere; Kubernetes; AWS migration.
EDUCATION
Master of Computer Science, University X 2015 - 2017`;

test('skills: ranked strongest first, with levels from the CV evidence', async () => {
  const skills = rankSkills(CV, 'AWS, GCP, Azure, Kubernetes, Terraform, Python, Snowflake, Databricks, Airflow, LangChain, RAG, Postgres, k8s, Communication', 'Built a RAG platform on AWS Bedrock with LangChain and Python; Kubernetes on EKS');
  const names = skills.map((s) => s.name);
  const level = (n) => skills.find((s) => s.name === n)?.level;
  assert.ok(names.length >= 12 && names.length <= 20, `count ${names.length}`);
  for (const must of ['AWS', 'Kubernetes', 'Python', 'Terraform', 'Snowflake', 'Databricks', 'Airflow', 'LangChain', 'RAG', 'PostgreSQL', 'GCP', 'Bedrock', 'dbt', 'Spark', 'BigQuery']) assert.ok(names.includes(must), `missing ${must}: ${names.join(', ')}`);
  assert.equal(level('AWS'), 5, '6 years of AWS stated');
  assert.ok(level('Kubernetes') >= 4, '4 years + many mentions');
  assert.ok(!names.includes('Go'), '"go-to-market" / "go-live" is not the Go language');
  assert.ok(!names.includes('Postgres') && !names.includes('k8s'), 'other spellings fold into the real name');
  // Sorted: levels never go up along the list; soft skills are not on top.
  for (let i = 1; i < skills.length; i += 1) assert.ok(skills[i].level <= skills[i - 1].level, `not sorted at ${skills[i].name}`);
  assert.notEqual(names[0], 'Communication');
  assert.ok(new Set(skills.map((s) => s.level)).size >= 2, 'levels differ, not all 3');
});

test('full parse (no AI key): uses the ranked skills', async () => {
  const { generator, fields } = await parseResumeToProfile(CV);
  assert.equal(generator, 'heuristic');
  assert.equal(fields.skills[0].level, 5);
  assert.ok(fields.skills.some((s) => s.name === 'Snowflake'));
});
