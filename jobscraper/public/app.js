// Job Scraper UI: read a job link (or pasted text) → editable JobsMatchNow job → save / download the import file.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const api = async (path, opts = {}) => {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
};
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600); };

const GROUPS = { 'g-ai-ml': 'AI & Machine Learning', 'g-data': 'Data', 'g-cloud-devops': 'Cloud & DevOps', 'g-software': 'Software Engineering' };
// The JobsMatchNow job editor, step by step. k = field name in the job file.
const STEPS = [
  { title: 'Basics', fields: [
    { k: 'title', label: 'Job title', req: true }, { k: 'company', label: 'Company' }, { k: 'department', label: 'Department' },
    { k: 'openings', label: 'Openings', type: 'number' }, { k: 'urgency', label: 'Urgency', ph: 'e.g. Hiring ASAP' }, { k: 'deadline', label: 'Application deadline', type: 'date' },
    { k: 'type', label: 'Employment type', type: 'choice', options: ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'], req: true, wide: true },
    { k: 'workMode', label: 'Work mode', type: 'choice', options: ['Remote', 'Hybrid', 'On-site', 'Flexible'], req: true, wide: true },
    { k: 'contractDuration', label: 'Contract duration', ph: 'e.g. Permanent, 6 months' }, { k: 'startDate', label: 'Start date', ph: 'e.g. Within 1 month' },
    { k: 'location', label: 'Location', req: true }, { k: 'hiringRadiusKm', label: 'Max distance (km)', type: 'number' },
    { k: 'workVisaRequired', label: 'Required valid work visa and nationality', type: 'yesno', wide: true },
  ] },
  { title: 'Role details & skills', fields: [
    { k: 'seniority', label: 'Seniority', type: 'choice', options: ['junior', 'mid', 'senior', 'lead', 'exec'], wide: true },
    { k: 'fullDescription', label: 'Role details: the full job description', type: 'textarea', rows: 12, req: true, wide: true },
    { k: 'description', label: 'Short summary', type: 'textarea', rows: 2, wide: true },
    { k: 'requiredSkillsDetail', label: 'Must have', type: 'skills', req: true, wide: true },
    { k: 'niceToHaves', label: 'Nice to have', type: 'tags', req: true, wide: true },
    { k: 'requiredLanguages', label: 'Languages', type: 'tags', req: true, wide: true },
    { k: 'responsibilities', label: 'Responsibilities', type: 'tags', wide: true },
  ] },
  { title: 'Compensation', fields: [
    { k: 'salaryRange', label: 'Salary range', type: 'salary', req: true, wide: true },
    { k: 'salaryNegotiable', label: 'Negotiable', type: 'yesno' }, { k: 'bonus', label: 'Bonus', ph: 'e.g. Up to 15% annual' }, { k: 'equity', label: 'Equity', ph: 'e.g. 0.1–0.3%' },
    { k: 'benefits', label: 'Benefits', type: 'tags', wide: true },
    { k: 'workingHours', label: 'Working hours', ph: 'e.g. 9–6, core hours 10–4' }, { k: 'flexibleHours', label: 'Flexibility', ph: 'e.g. Fully flexible' },
    { k: 'probation', label: 'Probation', ph: 'e.g. 60 days' }, { k: 'travel', label: 'Travel', ph: 'e.g. Up to 10%' },
    { k: 'hybridDays', label: 'Office days per week', type: 'number' }, { k: 'onCall', label: 'On-call', ph: 'e.g. 1 week in 6' },
    { k: 'visaSponsorship', label: 'Visa sponsorship', type: 'yesno' }, { k: 'relocationSupport', label: 'Relocation support', type: 'yesno' },
    { k: 'externalUrl', label: 'External posting URL', type: 'url', wide: true },
  ] },
];

let job = null; let savedId = null;
const state = { tab: 'link' };

function tagFor(k) {
  if (!job) return '';
  if (job.review?.check?.includes(k)) return '<span class="tag check">Check</span>';
  if (job.review?.notProvided?.includes(k) && empty(job[k])) return '<span class="tag none">Not provided</span>';
  return '';
}
const empty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

function fieldHtml(f) {
  const v = job[f.k];
  const head = `<span>${esc(f.label)}${f.req ? ' <b class="req">*</b>' : ''} ${tagFor(f.k)}</span>`;
  const cls = `field${f.wide ? ' wide' : ''}`;
  switch (f.type) {
    case 'choice': return `<div class="${cls}">${head}<div class="chips" data-k="${f.k}">${f.options.map((o) => `<button type="button" class="chip${v === o ? ' on' : ''}" data-v="${esc(o)}">${esc(o[0].toUpperCase() + o.slice(1))}</button>`).join('')}</div></div>`;
    case 'yesno': return `<div class="${cls}">${head}<div class="chips" data-k="${f.k}" data-bool="1">${[['Yes', true], ['No', false]].map(([l, b]) => `<button type="button" class="chip${v === b ? ' on' : ''}" data-v="${b}">${l}</button>`).join('')}</div></div>`;
    case 'textarea': return `<label class="${cls}">${head}<textarea data-k="${f.k}" rows="${f.rows || 4}" placeholder="Not provided">${esc(v || '')}</textarea></label>`;
    case 'tags': return `<div class="${cls}">${head}<div class="tags" data-k="${f.k}">${(v || []).map((t, i) => `<span class="pill">${esc(t)}<button type="button" aria-label="Remove ${esc(t)}" data-rm="${i}">×</button></span>`).join('')}<input placeholder="Add, press Enter"></div></div>`;
    case 'skills': return `<div class="${cls}">${head}<div class="tags" data-k="${f.k}" data-skills="1">${(v || []).map((s, i) => `<span class="pill">${esc(s.name)} <span class="dots" title="Weight ${s.weight}">${[1, 2, 3].map((w) => `<button type="button" class="dot${w <= s.weight ? ' on' : ''}" data-i="${i}" data-w="${w}" aria-label="Weight ${w}"></button>`).join('')}</span><button type="button" aria-label="Remove ${esc(s.name)}" data-rm="${i}">×</button></span>`).join('')}<input placeholder="Add a must-have skill, press Enter"></div><small>Dots set the weight (1–3) that feeds the fit score.</small></div>`;
    case 'salary': {
      const s = v || {};
      return `<div class="${cls}">${head}<div class="salary"><input data-sal="min" inputmode="numeric" placeholder="Min" value="${esc(s.min ?? '')}"><span>–</span><input data-sal="max" inputmode="numeric" placeholder="Max" value="${esc(s.max ?? '')}">
        <input data-sal="currency" maxlength="3" placeholder="USD" value="${esc(s.currency ?? '')}"><select data-k="salaryPeriod">${['', 'year', 'month', 'hour', 'day'].map((p) => `<option value="${p}"${(job.salaryPeriod || '') === p ? ' selected' : ''}>${p ? `per ${p}` : 'period?'}</option>`).join('')}</select></div>
        <small>JobsMatchNow shows salary up front: leave it empty if the job doesn&rsquo;t state one.</small></div>`;
    }
    default: return `<label class="${cls}">${head}<input data-k="${f.k}" type="${f.type || 'text'}" value="${esc(v ?? '')}" placeholder="${esc(f.ph || 'Not provided')}"></label>`;
  }
}

function render() {
  const ed = $('#editor');
  if (!job) { ed.hidden = true; return; }
  ed.hidden = false;
  const src = job.source || {};
  ed.innerHTML = `
    <article class="card source">
      <div><b>Source:</b> ${esc(src.name || 'Not provided')} · <b>How:</b> ${esc(src.method || '—')} · <b>Read:</b> ${src.retrievedAt ? esc(new Date(src.retrievedAt).toLocaleString()) : '—'}</div>
      ${src.url ? `<div class="src-url"><b>Original link:</b> <a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(src.url)}</a></div>` : ''}
      <div class="summary"><span class="tag check">Check</span> ${job.review?.check?.length || 0} field(s) read from free text · <span class="tag none">Not provided</span> ${job.review?.notProvided?.filter((k) => empty(job[k])).length || 0} field(s)</div>
    </article>
    ${STEPS.map((st, i) => `<article class="card step"><p class="overline">Step ${i + 1} of ${STEPS.length}</p><h2>${st.title}</h2><div class="grid">${st.fields.map(fieldHtml).join('')}</div></article>`).join('')}
    <article class="card step"><p class="overline">Job groups</p><h2>Where candidates can discover it</h2>
      <div class="groups">${Object.entries(GROUPS).map(([id, name]) => `<label><input type="checkbox" data-group="${id}"${job.jobGroups.includes(id) ? ' checked' : ''}> ${name}${listGroupIds(currentItem()).includes(id) ? ' <span class="tag ok">From your list</span>' : job.suggestedJobGroups?.includes(id) && !job.jobGroups.includes(id) ? ' <span class="tag sugg">Suggested</span>' : ''}</label>`).join('')}</div>
      <small>Groups named in your list are ticked; suggestions from the title and skills are never ticked for you.</small></article>
    <div class="savebar">
      <button type="button" class="primary" id="save">${savedId ? 'Save changes' : 'Save to library'}</button>
      <button type="button" class="secondary" id="download">Download .json</button>
      <button type="button" class="secondary" id="copy">Copy JSON</button>
      ${currentItem() ? '<button type="button" class="secondary" id="next-link">Next link →</button>' : ''}
    </div>`;
}

// Editing (event delegation).
$('#editor').addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.k && t.tagName !== 'SELECT') { const f = STEPS.flatMap((s) => s.fields).find((x) => x.k === t.dataset.k); job[t.dataset.k] = t.value === '' ? null : f?.type === 'number' ? Number(t.value) : t.value; }
  if (t.dataset.sal) {
    const r = job.salaryRange || { min: null, max: null, currency: '' };
    r[t.dataset.sal] = t.dataset.sal === 'currency' ? t.value.toUpperCase() : (t.value.replace(/[^\d]/g, '') ? Number(t.value.replace(/[^\d]/g, '')) : null);
    job.salaryRange = r.min || r.max || r.currency ? r : null;
  }
});
$('#editor').addEventListener('change', (e) => {
  const t = e.target;
  if (t.tagName === 'SELECT' && t.dataset.k) job[t.dataset.k] = t.value || null;
  if (t.dataset.group) { job.jobGroups = t.checked ? [...new Set([...job.jobGroups, t.dataset.group])] : job.jobGroups.filter((g) => g !== t.dataset.group); render(); }
});
$('#editor').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const chips = b.closest('.chips');
  if (chips) { const k = chips.dataset.k; const v = chips.dataset.bool ? b.dataset.v === 'true' : b.dataset.v; job[k] = job[k] === v ? null : v; return render(); }
  const tags = b.closest('.tags');
  if (tags && b.dataset.rm !== undefined) { job[tags.dataset.k].splice(Number(b.dataset.rm), 1); return render(); }
  if (b.dataset.w) { job.requiredSkillsDetail[Number(b.dataset.i)].weight = Number(b.dataset.w); return render(); }
  if (b.id === 'save') return void save();
  if (b.id === 'download') return download(job);
  if (b.id === 'next-link') return void nextItem();
  if (b.id === 'copy') return navigator.clipboard.writeText(JSON.stringify(fileOf([job]), null, 2)).then(() => toast('Copied'));
});
$('#editor').addEventListener('keydown', (e) => {
  const t = e.target; const tags = t.closest?.('.tags');
  if (!tags || e.key !== 'Enter') return;
  e.preventDefault();
  const v = t.value.trim(); if (!v) return;
  const k = tags.dataset.k;
  job[k] = job[k] || [];
  if (tags.dataset.skills) { if (!job[k].some((s) => s.name.toLowerCase() === v.toLowerCase())) job[k].push({ name: v, weight: 2 }); }
  else if (!job[k].includes(v)) job[k].push(v);
  render(); $(`.tags[data-k="${k}"] input`)?.focus();
});

const fileOf = (jobs) => ({ format: 'jobsmatchnow-job/v1', exportedAt: new Date().toISOString(), generator: 'jobscraper', jobs: jobs.map(({ id, savedAt, ...j }) => ({ ...j, url: j.source?.url || j.externalUrl || null })) });
function download(j) {
  const blob = new Blob([JSON.stringify(fileOf([j]), null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${String(j.title || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}.jobsmatchnow.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function save() {
  if (!String(job.title || '').trim()) return toast('Add a job title first');
  try {
    const r = await api('/api/jobs', { method: 'POST', body: { job: { ...job, id: savedId || undefined } } }); savedId = r.job.id;
    const it = currentItem();
    if (it) { await api(`/api/batches/${state.batch.id}/items/${it.id}`, { method: 'PATCH', body: { status: 'saved', jobId: savedId } }); await loadBatch(state.batch.id); }
    else if (state.batch) { await api(`/api/batches/${state.batch.id}/items`, { method: 'POST', body: { jobId: savedId } }); await loadBatch(state.batch.id); }
    if (state.multi) { const i = state.multi.findIndex((m) => m.title === job.title && (m.source?.part || '') === (job.source?.part || '')); if (i >= 0) { state.multi[i] = structuredClone(job); state.multiSaved[i] = savedId; } renderMulti(); }
    toast(it ? 'Saved · “Next link →” for the next one' : state.batch ? `Saved and added to the list “${state.batch.name}”` : 'Saved to the library'); render(); loadLibrary(); refreshImports();
  } catch (e) { toast(e.message); }
}

async function loadLibrary() {
  const { jobs } = await api('/api/jobs');
  $('#library').innerHTML = jobs.length ? jobs.map((j) => `<li><button type="button" class="lib-open" data-id="${esc(j.id)}"><strong>${esc(j.title)}</strong><small>${esc(j.company || 'Company not provided')} · ${esc(new Date(j.savedAt).toLocaleDateString())}${j.sentTo ? ' · in JobsMatchNow' : ''}</small></button>
    <a href="/api/export?id=${encodeURIComponent(j.id)}&download=1" aria-label="Download ${esc(j.title)}">⇩</a><button type="button" class="lib-del" data-id="${esc(j.id)}" aria-label="Delete ${esc(j.title)}">×</button></li>`).join('') : '<li class="empty">No saved jobs yet.</li>';
  $('#library').onclick = async (e) => {
    const open = e.target.closest('.lib-open'); const del = e.target.closest('.lib-del');
    if (open) { const j = jobs.find((x) => x.id === open.dataset.id); job = structuredClone(j); savedId = j.id; render(); $('#editor').scrollIntoView({ behavior: 'smooth' }); }
    if (del && confirm('Delete this job from the library?')) { await api(`/api/jobs/${del.dataset.id}`, { method: 'DELETE' }); if (savedId === del.dataset.id) savedId = null; loadLibrary(); }
  };
}

// Input: tabs, read link, parse text.
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  $('#paste-wrap').hidden = tab !== 'paste'; $('#parse-text').hidden = tab !== 'paste'; $('#read-link').hidden = tab !== 'link';
  $('#list-wrap').hidden = tab !== 'list'; $('#make-list').hidden = tab !== 'list'; $('#url-wrap').hidden = tab === 'list' || tab === 'sites';
  $('#recent-lists').hidden = tab !== 'list' || !$('#recent-lists').options.length;
  $('#sites-wrap').hidden = tab !== 'sites';
  $('#mailbox-wrap').hidden = tab !== 'mailbox';
  if (tab === 'mailbox') { $('#url-wrap').hidden = true; $('#read-link').hidden = true; void loadMailbox(); }
  document.querySelector('.optin').hidden = tab === 'sites' || tab === 'mailbox';
  if (tab === 'sites') void loadSites();
  $('#link-hint').textContent = tab === 'paste' ? '(optional, kept as the source)' : '';
}

// ---------- Lists of links ----------
const GROUP_NAMES = { 'g-ai-ml': 'AI & Machine Learning', 'g-software': 'Software Engineering', 'g-cloud-devops': 'Cloud & DevOps', 'g-data': 'Data' };
const STATUS = { pending: ['Not read yet', 'none'], 'needs-text': ['Paste text', 'check'], ready: ['Read · review', 'sugg'], saved: ['Saved', 'ok'], failed: ['Could not read', 'err'], skipped: ['Skipped', 'none'] };
const currentItem = () => state.batch?.items.find((i) => i.id === state.itemId) || null;
const listGroupIds = (it) => [...new Set((it?.groups || []).map((g) => g.id).filter(Boolean))];
const remember = (id) => { try { if (id) localStorage.setItem('jobscraper.list', id); else localStorage.removeItem('jobscraper.list'); } catch { /* private mode */ } };

async function loadBatch(id) {
  try { state.batch = (await api(`/api/batches/${id}`)).batch; remember(id); } catch { state.batch = null; remember(null); }
  renderBatch();
}
async function loadRecentLists() {
  const { batches } = await api('/api/batches');
  $('#recent-lists').innerHTML = batches.length ? `<option value="">Open a saved list…</option>${batches.map((b) => `<option value="${esc(b.id)}">${esc(b.name)} (${b.saved}/${b.total} saved)</option>`).join('')}` : '';
  $('#recent-lists').hidden = state.tab !== 'list' || !batches.length;
}
$('#recent-lists').addEventListener('change', (e) => { if (e.target.value) void loadBatch(e.target.value); });

function renderBatch() {
  const el = $('#batch'); const b = state.batch;
  if (!b) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const count = (s) => b.items.filter((i) => i.status === s).length;
  const sections = []; // by first group label, in the order of the list
  for (const it of b.items) {
    const label = it.groups[0]?.label || 'No group';
    let sec = sections.find((s) => s.label === label);
    if (!sec) { sec = { label, id: it.groups[0]?.id || null, items: [] }; sections.push(sec); }
    sec.items.push(it);
  }
  const savedIds = b.items.map((i) => i.jobId).filter(Boolean);
  el.innerHTML = `
    <div class="batch-head"><div><p class="overline">List of links</p><h2>${esc(b.name)}</h2>
      <p class="hint">${b.items.length} job${b.items.length === 1 ? '' : 's'} · ${count('saved')} saved · ${count('ready')} to review · ${count('needs-text')} need pasted text · ${count('pending')} not read · ${count('failed')} failed${b.duplicates?.length ? ` · ${b.duplicates.length} duplicate link(s) removed` : ''}${b.invalid?.length ? ` · ${b.invalid.length} line(s) ignored` : ''}</p></div>
      <button type="button" class="ghost" data-act="close">Close list</button></div>
    <div class="progress" aria-hidden="true"><span style="width:${Math.round((count('saved') / b.items.length) * 100)}%"></span></div>
    <div class="row-actions">
      ${count('pending') ? '<button type="button" class="primary" data-act="read-all">Read all links</button>' : ''}
      <button type="button" class="secondary" data-act="next">Next link →</button>
      <button type="button" class="primary jf-import" data-act="jf-import">Import to JobFinder account (${b.items.filter((i) => i.status !== 'saved').length})</button>
      <button type="button" class="secondary" data-act="import-csv">CSV for JobsMatchNow import</button>
      <a class="secondary" href="/api/export.csv?list=${encodeURIComponent(b.id)}">Full CSV (${b.items.length} roles, all fields)</a>
      ${savedIds.length ? `<a class="secondary" href="/api/export?ids=${encodeURIComponent(savedIds.join(','))}&download=1">Download this list (${savedIds.length})</a>` : ''}
    </div>
    <div class="import-out" id="list-import"></div>
    ${b.invalid?.length ? `<details class="ignored"><summary>${b.invalid.length} line(s) ignored</summary><ul>${b.invalid.map((x) => `<li>Line ${x.line}: ${esc(x.text)} · ${esc(x.reason)}</li>`).join('')}</ul></details>` : ''}
    ${sections.map((s) => `<section class="batch-sec"><h3>${esc(s.label)} ${s.id ? `<span class="tag sugg">${esc(GROUP_NAMES[s.id])}</span>` : '<span class="tag none">no matching group</span>'}</h3>
      <ol>${s.items.map((it) => {
        const [txt, cls] = STATUS[it.status] || [it.status, 'none'];
        const act = it.status === 'pending' ? 'read' : ['needs-text', 'failed'].includes(it.status) ? 'paste' : 'open';
        const actLabel = act === 'read' ? 'Read' : act === 'paste' ? 'Paste text' : 'Open';
        const label = it.added ? `${esc(it.title || 'Pasted job')}${it.url ? ` · <a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer nofollow">link</a>` : ''}`
          : `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(it.url.replace(/^https?:\/\/(www\.)?/, ''))}</a>`;
        return `<li class="${it.id === state.itemId ? 'current' : ''}">${label}
          ${it.groups.length > 1 ? it.groups.slice(1).map((g) => `<span class="tag sugg">+ ${esc(g.label)}</span>`).join('') : ''}
          <span class="tag ${cls}">${txt}</span><button type="button" class="secondary small" data-act="${act}" data-id="${it.id}">${actLabel}</button></li>`;
      }).join('')}</ol></section>`).join('')}`;
  if (state.listImportShown) void showImport(`list=${encodeURIComponent(b.id)}`, $('#list-import'), { download: false }); // keep the count fresh
}

async function readItem(it, { open = true } = {}) {
  const r = await api(`/api/batches/${state.batch.id}/items/${it.id}/read`, { method: 'POST' });
  if (r.ok) {
    const saved = await api('/api/jobs', { method: 'POST', body: { job: r.job } });
    await api(`/api/batches/${state.batch.id}/items/${it.id}`, { method: 'PATCH', body: { status: 'ready', jobId: saved.job.id } });
    if (open) { job = saved.job; savedId = saved.job.id; state.itemId = it.id; render(); }
  }
  return r;
}
function pasteFor(it) {
  state.itemId = it.id; job = null; savedId = null; render();
  setTab('paste'); $('#url').value = it.url; $('#paste').value = '';
  $('#notice').hidden = false;
  $('#notice').textContent = `${it.message || 'This link could not be read.'} Groups from your list: ${it.groups.map((g) => g.label).join(', ') || 'none'}.`;
  renderBatch(); $('#input-card').scrollIntoView({ behavior: 'smooth' }); $('#paste').focus();
}
async function openItem(it) {
  const jobs = (await api('/api/jobs')).jobs;
  const j = jobs.find((x) => x.id === it.jobId);
  if (!j) return pasteFor(it);
  job = structuredClone(j); savedId = j.id; state.itemId = it.id; render(); renderBatch();
  $('#editor').scrollIntoView({ behavior: 'smooth' });
}
async function nextItem() {
  const b = state.batch; if (!b) return;
  const order = b.items; const start = Math.max(0, order.findIndex((i) => i.id === state.itemId) + 1);
  const rest = [...order.slice(start), ...order.slice(0, start)];
  const it = rest.find((i) => ['needs-text', 'failed', 'pending', 'ready'].includes(i.status));
  if (!it) return toast('Every link in this list is saved');
  if (it.status === 'pending') { busy(true); try { const r = await readItem(it); if (!r.ok) { await loadBatch(b.id); pasteFor(currentItem() || it); } else await loadBatch(b.id); } finally { busy(false); } }
  else if (it.status === 'ready') await openItem(it);
  else pasteFor(it);
}
$('#batch').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const act = btn.dataset.act; const it = state.batch?.items.find((i) => i.id === btn.dataset.id);
  if (act === 'jf-import') return void importList();
  if (act === 'import-csv') return void showImport(`list=${encodeURIComponent(state.batch.id)}`, $('#list-import'));
  if (act === 'close') { state.batch = null; state.itemId = null; state.listImportShown = false; remember(null); renderBatch(); return; }
  if (act === 'next') return void nextItem();
  if (act === 'paste') return pasteFor(it);
  if (act === 'open') return void openItem(it);
  if (act === 'read') { busy(true); try { const r = await readItem(it); await loadBatch(state.batch.id); if (!r.ok) pasteFor(currentItem()); } catch (er) { toast(er.message); } finally { busy(false); } return; }
  if (act === 'read-all') {
    const pending = state.batch.items.filter((i) => i.status === 'pending');
    busy(true);
    try {
      for (const [n, it2] of pending.entries()) {
        $('#busy').textContent = `Reading ${n + 1} of ${pending.length}…`;
        try { await readItem(it2, { open: false }); } catch (er) { toast(er.message); if (/Too many/.test(er.message)) break; }
        await loadBatch(state.batch.id);
        if (n < pending.length - 1) await new Promise((r) => setTimeout(r, 1500)); // polite: one page at a time
      }
    } finally { $('#busy').textContent = 'Working…'; busy(false); }
    toast('Done: review the jobs marked “Read · review”, paste text for the others');
  }
});
$('#make-list').addEventListener('click', async () => {
  busy(true);
  try {
    const { batch } = await api('/api/batches', { method: 'POST', body: { text: $('#list').value } });
    state.batch = batch; state.itemId = null; remember(batch.id); renderBatch(); loadRecentLists();
    toast(`${batch.items.length} job links in the list`);
    $('#batch').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { toast(e.message); } finally { busy(false); }
});
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));
const busy = (on) => { $('#busy').hidden = !on; $('#read-link').disabled = on; $('#parse-text').disabled = on; };
$('#read-link').addEventListener('click', async () => {
  const url = $('#url').value.trim(); if (!url) return toast('Paste a job link');
  busy(true); $('#notice').hidden = true;
  try {
    const r = await api('/api/scrape', { method: 'POST', body: { url } });
    if (r.ok) { job = r.job; savedId = null; render(); toast('Job read: check the marked fields'); }
    else { $('#notice').hidden = false; $('#notice').textContent = r.message; if (r.url) $('#url').value = r.url; setTab('paste'); $('#paste').focus(); }
  } catch (e) { toast(e.message); } finally { busy(false); }
});
$('#parse-text').addEventListener('click', async () => {
  busy(true);
  try {
    const r = await api('/api/parse', { method: 'POST', body: { text: $('#paste').value, url: $('#url').value.trim() || undefined } });
    const jobs = r.jobs?.length ? r.jobs : [r.job];
    const it = currentItem();
    const fromList = it && it.url === $('#url').value.trim();
    if (fromList) for (const j of jobs) j.jobGroups = listGroupIds(it); // groups you stated in the list
    else state.itemId = null;
    state.multi = jobs.length > 1 ? jobs : null; state.multiSaved = [];
    job = jobs[0]; savedId = null;
    render(); renderMulti(); $('#notice').hidden = true;
    toast(jobs.length > 1 ? `This post lists ${jobs.length} roles: check them, then “Save all”` : 'Parsed: check the marked fields');
    $(jobs.length > 1 ? '#multi' : '#editor').scrollIntoView({ behavior: 'smooth' });
  }
  catch (e) { toast(e.message); } finally { busy(false); }
});
$('#new-job').addEventListener('click', () => { job = null; savedId = null; state.itemId = null; state.multi = null; renderMulti(); renderBatch(); $('#url').value = ''; $('#paste').value = ''; $('#notice').hidden = true; setTab('link'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
// ---------- A pasted post with several roles ----------
function renderMulti() {
  const el = $('#multi'); const jobs = state.multi;
  if (!jobs || jobs.length < 2) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const saved = jobs.filter((_, i) => state.multiSaved[i]).length;
  el.innerHTML = `<p class="overline">One post, several roles</p><h2>This post lists ${jobs.length} roles</h2>
    <p class="hint">Each role is a separate job with the post's shared details (location, language, how to apply). Open one to check or edit it, or save them all.${state.batch ? ` They are added to the list “${esc(state.batch.name)}”, so its CSV includes them.` : ''}</p>
    <ol class="multi-list">${jobs.map((j, i) => `<li class="${job && j.title === job.title && (j.source?.part || '') === (job.source?.part || '') ? 'current' : ''}">
      <b>${esc(j.title || 'Untitled')}</b> <small>${esc([j.location, j.seniority, j.salaryNegotiable ? 'salary negotiable' : null].filter(Boolean).join(' · '))}</small>
      ${state.multiSaved[i] ? '<span class="tag ok">Saved</span>' : ''}<button type="button" class="secondary small" data-open="${i}">Open</button></li>`).join('')}</ol>
    <div class="row-actions"><button type="button" class="primary" id="save-all">${saved === jobs.length ? 'Save all again' : `Save all ${jobs.length} roles`}</button></div>`;
}
$('#multi').addEventListener('click', async (e) => {
  const open = e.target.closest('[data-open]');
  if (open) { const i = Number(open.dataset.open); job = structuredClone(state.multi[i]); savedId = state.multiSaved[i] || null; render(); renderMulti(); $('#editor').scrollIntoView({ behavior: 'smooth' }); return; }
  if (e.target.id !== 'save-all') return;
  const btn = e.target; btn.disabled = true;
  try {
    for (const [i, j] of state.multi.entries()) {
      const r = await api('/api/jobs', { method: 'POST', body: { job: { ...j, id: state.multiSaved[i] || undefined } } });
      state.multiSaved[i] = r.job.id;
      if (state.batch) await api(`/api/batches/${state.batch.id}/items`, { method: 'POST', body: { jobId: r.job.id } });
    }
    if (job) savedId = state.multiSaved[state.multi.findIndex((m) => m.title === job.title && (m.source?.part || '') === (job.source?.part || ''))] || savedId;
    toast(`${state.multi.length} roles saved${state.batch ? ` and added to “${state.batch.name}”` : ''}`);
    if (state.batch) await loadBatch(state.batch.id);
    renderMulti(); render(); loadLibrary(); refreshImports();
  } catch (er) { toast(er.message); } finally { btn.disabled = false; }
});

// ---------- CSV for JobsMatchNow import (≤ 50 roles per file) ----------
/** Re-count the import panels that are open, after any save (never starts a download by itself). */
function refreshImports() {
  if ($('#lib-import').innerHTML) void showImport('', $('#lib-import'), { download: false });
  // the list panel is refreshed by renderBatch()
}
async function showImport(query, el, { download = true } = {}) {
  if (el.id === 'list-import') state.listImportShown = true;
  try {
    const r = await api(`/api/import.json?${query}`);
    const href = (n) => `/api/import.csv?${query}&part=${n}`;
    const links = Array.from({ length: r.parts }, (_, i) => `<a class="primary small" href="${href(i + 1)}">Download${r.parts > 1 ? ` part ${i + 1} of ${r.parts}` : ''} (.csv)</a>`).join(' ');
    el.innerHTML = `<p><b>${r.included} role${r.included === 1 ? '' : 's'} ready to import</b>${r.skipped.length ? ` · ${r.skipped.length} not included (no job description yet)` : ''}.</p>
      ${r.parts ? `<p class="row-actions">${links}</p>` : '<p class="hint">Read or paste at least one job first.</p>'}
      <p class="hint">In JobsMatchNow: <b>Add New Job Offers → ATS or job feed</b>, source <b>Another ATS</b>, upload the file${r.parts > 1 ? 's one by one (50 roles max each)' : ''}. Roles arrive as drafts; uploading the same file again adds nothing twice.</p>
      ${r.skipped.length ? `<details><summary>Not included (${r.skipped.length})</summary><ul>${r.skipped.map((s) => `<li>${esc(s.title || s.url)} · ${esc(s.reason)}</li>`).join('')}</ul></details>` : ''}`;
    if (download && r.parts === 1) window.location.href = href(1);
  } catch (e) { toast(e.message); }
}
$('#lib-import-btn').addEventListener('click', () => void showImport('', $('#lib-import')));

// ---------- Owner setting: read public LinkedIn job pages ----------
api('/api/settings').then((s) => { $('#allow-linkedin').checked = s.allowLinkedIn; }).catch(() => undefined);
$('#allow-linkedin').addEventListener('change', async (e) => {
  const on = e.target.checked;
  if (on && !confirm('Read public LinkedIn job pages?\n\nThis goes against LinkedIn\'s User Agreement and robots.txt, and LinkedIn may block your IP address. The tool never signs in and never gets past LinkedIn\'s checks.')) { e.target.checked = false; return; }
  try { await api('/api/settings', { method: 'POST', body: { allowLinkedIn: on } }); toast(on ? 'LinkedIn links can now be read: use Read / Read all links' : 'LinkedIn links: paste text only'); if (state.batch) await loadBatch(state.batch.id); }
  catch (er) { e.target.checked = !on; toast(er.message); }
});

// ---------- Send to JobsMatchNow (optional) ----------
function showJmn(s) {
  $('#jmn-out').hidden = s.signedIn; $('#jmn-in').hidden = !s.signedIn;
  if (s.signedIn) $('#jmn-who').textContent = `Signed in as ${s.user?.name || s.user?.email || 'your account'} on ${s.base.replace(/^https?:\/\//, '')}.`;
}
/** Which saved jobs to send: the open list's saved jobs, otherwise every library job not sent yet. */
async function jobsToSend() {
  const { jobs } = await api('/api/jobs');
  if (state.batch) { const ids = state.batch.items.filter((i) => i.status === 'saved' && i.jobId).map((i) => i.jobId); return { scope: `the list “${state.batch.name}”`, jobs: jobs.filter((j) => ids.includes(j.id)) }; }
  return { scope: 'the library (not sent yet)', jobs: jobs.filter((j) => !j.sentTo) };
}
$('#jmn-login').addEventListener('click', async () => {
  const btn = $('#jmn-login'); btn.disabled = true;
  try { showJmn(await api('/api/jmn/login', { method: 'POST', body: { base: $('#jmn-base').value, email: $('#jmn-email').value, password: $('#jmn-pass').value } })); toast('Signed in to JobsMatchNow'); }
  catch (e) { toast(e.message); } finally { $('#jmn-pass').value = ''; btn.disabled = false; }
});
$('#jmn-logout').addEventListener('click', async () => { showJmn(await api('/api/jmn/logout', { method: 'POST' })); $('#jmn-results').innerHTML = ''; });
$('#jmn-send').addEventListener('click', async () => {
  const { scope, jobs } = await jobsToSend();
  if (!jobs.length) return toast(state.batch ? 'Save at least one job of this list first' : 'No saved jobs to send');
  const noCompany = jobs.filter((j) => !String(j.company || '').trim()).length;
  if (!confirm(`Send ${jobs.length} job(s) from ${scope} to ${$('#jmn-who').textContent.replace(/^Signed in as /, '').replace(/\.$/, '')} as JobFinder DRAFTS?${noCompany ? `\n\n${noCompany} job(s) have no company and will be skipped.` : ''}\n\nNothing is published; jobs already listed (same source link) are skipped.`)) return;
  const btn = $('#jmn-send'); btn.disabled = true; btn.textContent = `Sending ${jobs.length}…`;
  try {
    const out = await api('/api/jmn/send', { method: 'POST', body: { ids: jobs.map((j) => j.id) } });
    const n = (s) => out.results.filter((r) => r.status === s).length;
    $('#jmn-results').innerHTML = `<li class="sum">${n('created')} created as drafts · ${n('skipped')} already there · ${n('failed')} failed</li>${out.results.map((r) => `<li><span class="tag ${r.status === 'created' ? 'ok' : r.status === 'skipped' ? 'sugg' : 'err'}">${r.status}</span> ${esc(r.title || '')}${r.reason ? ` <small>· ${esc(r.reason)}</small>` : ''}${r.duplicates ? ' <small>· JobsMatchNow flags a possible duplicate</small>' : ''}</li>`).join('')}
      ${n('created') ? `<li><a href="${esc(out.base)}/app/" target="_blank" rel="noopener">Open JobsMatchNow → My Jobs list</a></li>` : ''}`;
    if (!out.base) showJmn({ signedIn: false });
    loadLibrary();
  } catch (e) { toast(e.message); if (/sign in/i.test(e.message)) showJmn({ signedIn: false }); }
  finally { btn.disabled = false; btn.textContent = 'Send saved jobs as drafts'; }
});
api('/api/jmn/status').then((s) => { showJmn(s); if (!s.signedIn) $('#jmn-base').value = s.base; }).catch(() => undefined);

setTab('link');
loadLibrary().catch(() => undefined);
loadRecentLists().catch(() => undefined);
try { const last = localStorage.getItem('jobscraper.list'); if (last) void loadBatch(last); } catch { /* private mode */ }

// ---------- Career sites (2026-11-26): saved careers websites + the job-type filter ----------
let jobTypes = null;
async function loadJobTypes() {
  const r = await api('/api/job-types'); jobTypes = r;
  const anyOn = Boolean(r.current?.types?.includes('any'));
  $('#jt-types').classList.toggle('any-on', anyOn);
  $('#jt-types').innerHTML = `<label class="jt-chip any" title="Overrides every other job type and word: every job on every website is read"><input type="checkbox" value="any" ${anyOn ? 'checked' : ''}> Any job (no filter)</label>` + r.types.map((t) => `<label class="jt-chip" title="${esc(t.words.join(', '))}"><input type="checkbox" value="${esc(t.id)}" ${r.current?.types?.includes(t.id) ? 'checked' : ''}> ${esc(t.label)}</label>`).join('');
  $('#jt-custom').value = r.current?.custom || '';
}
$('#jt-save').addEventListener('click', async () => {
  const types = [...document.querySelectorAll('#jt-types input:checked')].map((i) => i.value);
  try { await api('/api/settings', { method: 'POST', body: { jobTypes: { types, custom: $('#jt-custom').value } } }); toast(types.includes('any') ? 'Saved: Any job, every job is read' : types.length || $('#jt-custom').value.trim() ? 'Job types saved' : 'Saved: no filter, every job is read'); }
  catch (e) { toast(e.message); }
});
const ago = (iso) => { if (!iso) return 'never checked'; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
async function loadSites() {
  if (!jobTypes) loadJobTypes().catch(() => undefined);
  const { sources } = await api('/api/sources');
  $('#sites-count').textContent = sources.length;
  const on = sources.filter((s) => s.enabled).length;
  $('#sites-selected').textContent = `${on} of ${sources.length} selected`;
  $('#sites-all').checked = sources.length > 0 && on === sources.length; $('#sites-all').indeterminate = on > 0 && on < sources.length;
  $('#sites').innerHTML = sources.length ? sources.map((s) => `<li data-id="${esc(s.id)}" class="${s.enabled ? '' : 'off'}">
      <input type="checkbox" class="site-on" ${s.enabled ? 'checked' : ''} aria-label="Scrape ${esc(s.name)}">
      <div><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><strong>${esc(s.name)}</strong></a>
        <small>${s.region ? `${esc(s.region)} · ` : ''}${s.keywords ? `own words: ${esc(s.keywords)} · ` : ''}${esc(ago(s.lastCheckedAt))}${s.lastResult ? ` · ${esc(s.lastResult)}` : ''}</small></div>
      <span><button type="button" class="secondary small" data-act="check">Find new jobs</button><button type="button" class="ghost small" data-act="del" aria-label="Remove ${esc(s.name)}">×</button></span></li>`).join('')
    : '<li class="empty">No websites yet. Add one above, or add the main job boards.</li>';
}
async function checkSite(id, { open = true } = {}) {
  const out = await api(`/api/sources/${id}/check`, { method: 'POST', body: { list: true } });
  if (!out.ok) { toast(out.message); return out; }
  const fresh = out.jobs.filter((j) => j.isNew).length;
  if (open && out.batch) { await loadBatch(out.batch.id); await loadRecentLists(); $('#batch').scrollIntoView({ behavior: 'smooth' }); }
  toast(`${out.source.name}: ${out.jobs.length} matching job(s), ${fresh} new${out.batch ? ' → list ready, press Read all links' : ''}`);
  return out;
}
$('#sites').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const id = btn.closest('li').dataset.id;
  if (btn.dataset.act === 'del') { if (!confirm('Remove this website from the list?')) return; await api(`/api/sources/${id}`, { method: 'DELETE' }); return void loadSites(); }
  btn.disabled = true; btn.textContent = 'Looking…';
  try { const out = await checkSite(id, { open: false }); renderFound([{ site: out.source || { name: 'Website' }, out }], false); $('#sites-results').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (err) { toast(err.message); } finally { await loadSites(); }
});
$('#sites-check-all').addEventListener('click', async () => {
  const sources = (await api('/api/sources')).sources.filter((s) => s.enabled);
  if (!sources.length) return toast('Tick at least one website first');
  const btn = $('#sites-check-all'); btn.disabled = true; let total = 0; const found = [];
  $('#sites-results').hidden = false; $('#sites-results').innerHTML = '<p class="hint">Looking for jobs…</p>';
  try {
    for (const [n, s] of sources.entries()) {
      btn.textContent = `Checking ${n + 1} of ${sources.length}…`;
      try { const out = await checkSite(s.id, { open: false }); total += (out.jobs || []).filter((j) => j.isNew).length; found.push({ site: s, out }); renderFound(found, n + 1 < sources.length); } catch (err) { toast(`${s.name}: ${err.message}`); found.push({ site: s, out: { ok: false, message: err.message, jobs: [] } }); }
      await new Promise((r) => setTimeout(r, 2500)); // polite: stays under the tool's 30 requests a minute
    }
    renderFound(found, false);
    toast(`${total} new matching job(s) across ${sources.length} websites`);
  } finally { btn.disabled = false; btn.textContent = 'Find new jobs on selected'; await loadSites(); await loadRecentLists(); }
});
$('#sites-defaults').addEventListener('click', async () => {
  try { const r = await api('/api/sources/defaults', { method: 'POST' }); toast(r.added.length ? `Added ${r.added.length} job board(s)` : 'All the main job boards are already in the list'); await loadSites(); }
  catch (e) { toast(e.message); }
});
const siteForm = () => ({ url: $('#site-url').value.trim(), name: $('#site-name').value.trim(), region: $('#site-region').value.trim(), keywords: $('#site-keywords').value.trim() });
$('#site-preview').addEventListener('click', async () => {
  const f = siteForm(); if (!f.url) return toast('Paste the website link');
  const out$ = $('#site-preview-out'); out$.innerHTML = '<p class="hint">Looking for jobs…</p>';
  try {
    const r = await api('/api/discover', { method: 'POST', body: { url: f.url, ...(f.keywords ? { keywords: f.keywords } : {}) } });
    out$.innerHTML = r.ok ? `<p><b>${r.jobs.length}</b> matching of ${r.total} job(s) via ${esc(r.via)} (${esc(r.name)})</p><ul>${r.jobs.slice(0, 15).map((j) => `<li><a href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">${esc(j.title || j.url)}</a></li>`).join('')}</ul>`
      : `<p class="err">${esc(r.message)}</p>`;
  } catch (e) { out$.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
});
$('#site-add').addEventListener('click', async () => {
  const f = siteForm(); if (!f.url) return toast('Paste the website link');
  try { await api('/api/sources', { method: 'POST', body: f }); ['#site-url', '#site-name', '#site-region', '#site-keywords'].forEach((s) => { $(s).value = ''; }); $('#site-preview-out').innerHTML = ''; toast('Website added'); await loadSites(); }
  catch (e) { toast(e.message); }
});
// Tick boxes: which websites are scraped (saved in the tool, also used by the daily run).
$('#sites').addEventListener('change', async (e) => {
  const box = e.target.closest('input.site-on'); if (!box) return;
  try { await api(`/api/sources/${box.closest('li').dataset.id}`, { method: 'PATCH', body: { enabled: box.checked } }); } catch (err) { toast(err.message); }
  await loadSites();
});
$('#sites-all').addEventListener('change', async (e) => {
  try { await api('/api/sources/enabled', { method: 'POST', body: { all: true, enabled: e.target.checked } }); } catch (err) { toast(err.message); }
  await loadSites();
});// "Any job" overrides the other job types: show the others as inactive while it is ticked.
$('#jt-types').addEventListener('change', (e) => {
  if (e.target.value === 'any') $('#jt-types').classList.toggle('any-on', e.target.checked);
});// "Import to JobFinder account" (2026-11-26): each job of the list not yet sent is read if needed, saved, and sent
// straight to the JobFinder listings as a DRAFT (import key on this computer, no sign-in). JobsMatchNow skips duplicates.
async function importList() {
  const b = state.batch; if (!b) return;
  const st = await api('/api/jmn/import-status').catch(() => ({ ready: false }));
  if (!st.ready) return toast('No import key on this computer: ask for ~/.config/jobsmatchnow/import.key to be set up');
  const todo = b.items.filter((i) => i.status !== 'saved');
  if (!todo.length) return toast('Every job of this list is already in JobsMatchNow');
  if (!confirm(`Send ${todo.length} job(s) to ${st.base} → JobFinder account (published at once, in My Jobs list)?\n\nJobs already listed (same link, or same title + company + place) are skipped. A recruiter email found in a job is saved privately with it.`)) return;
  const out = $('#list-import'); const n = { created: 0, duplicate: 0, failed: 0 }; const failed = [];
  busy(true);
  try {
    for (const [i, it] of todo.entries()) {
      $('#busy').textContent = `Importing ${i + 1} of ${todo.length}…`;
      out.innerHTML = `<p class="hint">Importing ${i + 1} of ${todo.length} · ${n.created} added · ${n.duplicate} already there · ${n.failed} not imported</p>`;
      let r;
      try { r = await api('/api/jmn/import-item', { method: 'POST', body: { list: b.id, item: it.id } }); }
      catch (e) { r = { status: 'failed', message: e.message }; if (/Too many/.test(e.message)) { await new Promise((ok) => setTimeout(ok, 60000)); } }
      n[r.status] = (n[r.status] || 0) + 1;
      if (r.status === 'failed') failed.push(`${r.title || it.url}: ${r.message}`);
      if (i < todo.length - 1) await new Promise((ok) => setTimeout(ok, 2200)); // polite pace (pages + JobsMatchNow limits)
    }
  } finally { $('#busy').textContent = 'Working…'; busy(false); }
  await loadBatch(b.id); loadLibrary().catch(() => undefined);
  $('#list-import').innerHTML = `<p><b>${n.created}</b> published in the JobFinder account · ${n.duplicate} already there · ${n.failed} not imported. <a href="${esc(st.base)}/app/" target="_blank" rel="noopener">Open JobsMatchNow → My Jobs list</a></p>${failed.length ? `<details><summary>Not imported (${failed.length})</summary><ul>${failed.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}`;
}// Results of "Find new jobs on selected" (2026-11-26): every job found, by website, new ones marked, and one button
// to import every job of these lists straight into the JobFinder account (drafts; duplicates skipped by JobsMatchNow).
let lastFound = [];
function renderFound(found, running) {
  lastFound = found;
  const el = $('#sites-results'); el.hidden = false;
  const lists = found.map((f) => f.out.batch).filter(Boolean);
  const toSend = lists.reduce((a, b) => a + b.items.length, 0);
  const all = found.reduce((a, f) => a + (f.out.jobs || []).length, 0);
  const fresh = found.reduce((a, f) => a + (f.out.jobs || []).filter((j) => j.isNew).length, 0);
  el.innerHTML = `<div class="sr-head"><h3>Jobs found${running ? ' (still looking…)' : ''}</h3>
      <span>${!running && all ? `<button type="button" class="primary" id="sr-import">Import all ${all} found job(s) to JobFinder account</button>` : ''}
      <button type="button" class="ghost small" id="sr-close" aria-label="Close the results">×</button></span></div>
    <p class="hint">${all} matching job(s) on ${found.length} website(s) · <b>${fresh} new</b> (not seen before). New jobs are also saved as lists in “List of links”.</p>
    <div id="sr-out"></div>
    ${found.map(({ site, out }) => `<details class="sr-site"${(out.jobs || []).some((j) => j.isNew) ? ' open' : ''}><summary><b>${esc(site.name)}</b> · ${out.ok ? `${out.jobs.length} matching, ${out.jobs.filter((j) => j.isNew).length} new` : `<span class="err">${esc(out.message || 'failed')}</span>`}</summary>
      ${out.ok && out.jobs.length ? `<ul>${out.jobs.map((j) => `<li>${j.isNew ? '<span class="tag ok">New</span> ' : '<span class="tag none">Seen</span> '}<a href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">${esc(j.title || j.url)}</a></li>`).join('')}</ul>` : ''}</details>`).join('')}`;
}
$('#sites-results').addEventListener('click', async (e) => {
  if (e.target.closest('#sr-close')) { $('#sites-results').hidden = true; return; }
  if (!e.target.closest('#sr-import')) return;
  const st = await api('/api/jmn/import-status').catch(() => ({ ready: false }));
  if (!st.ready) return toast('No import key on this computer: ask for ~/.config/jobsmatchnow/import.key to be set up');
  // Every job found: the new ones are already in a list; the others get a list now ("all found"), so each one can be
  // imported. Jobs sent before are recognised by their link and skipped without reading the page again.
  const items = [];
  for (const { site, out } of lastFound) {
    if (!out.ok || !out.jobs?.length) continue;
    const covered = new Set((out.batch?.items || []).map((i) => i.url));
    if (out.batch) items.push(...out.batch.items.map((it) => ({ list: out.batch.id, it })));
    const rest = out.jobs.filter((j) => !covered.has(j.url));
    if (rest.length) {
      const { batch } = await api('/api/batches', { method: 'POST', body: { text: `${site.group || 'jobs'}\n${rest.map((j) => j.url).join('\n')}`, name: `${site.name} · all found · ${new Date().toLocaleDateString('en-GB')}`, region: site.region || '' } });
      items.push(...batch.items.map((it) => ({ list: batch.id, it })));
    }
  }
  if (!items.length) return toast('No jobs to import');
  if (!confirm(`Send ${items.length} job(s) to ${st.base} → JobFinder account (published at once, in My Jobs list)?\n\nJobs already listed (same link, or same title + company + place) are skipped. A recruiter email found in a job is saved privately with it.`)) return;
  const btn = $('#sr-import'); btn.disabled = true; const out = $('#sr-out');
  const n = { created: 0, duplicate: 0, failed: 0 }; const failed = [];
  for (const [i, { list, it }] of items.entries()) {
    btn.textContent = `Importing ${i + 1} of ${items.length}…`;
    out.innerHTML = `<p class="hint">${n.created} added · ${n.duplicate} already there · ${n.failed} not imported</p>`;
    let r;
    try { r = await api('/api/jmn/import-item', { method: 'POST', body: { list, item: it.id } }); }
    catch (er) { r = { status: 'failed', message: er.message }; if (/Too many/.test(er.message)) await new Promise((ok) => setTimeout(ok, 60000)); }
    n[r.status] = (n[r.status] || 0) + 1;
    if (r.status === 'failed') failed.push(`${r.title || it.url}: ${r.message}`);
    if (i < items.length - 1) await new Promise((ok) => setTimeout(ok, 2200));
  }
  btn.textContent = 'Done'; loadLibrary().catch(() => undefined); loadRecentLists().catch(() => undefined);
  out.innerHTML = `<p class="sr-done"><b>${n.created}</b> published in the JobFinder account · ${n.duplicate} already there · ${n.failed} not imported. <a href="${esc(st.base)}/app/" target="_blank" rel="noopener">Open JobsMatchNow → My Jobs list</a></p>${failed.length ? `<details><summary>Not imported (${failed.length})</summary><ul>${failed.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}`;
});// ---------- Mailbox (2026-11-26): the team's Gmail "linkjobs" pipeline, run from here ----------
const MB_SCRAPE = { '': ['To read', 'none'], ok: ['Read', 'ok'], 'skipped:job-type': ['Other job type', 'none'] };
let mbTimer = null;
async function loadMailbox() {
  let s; try { s = await api('/api/mailbox'); } catch (e) { $('#mb-setup').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  $('#mb-setup').innerHTML = s.ready ? `<p class="hint">Gmail connected (app password on this computer) · label <b>${esc(s.label)}</b>${s.latestEmail ? ` · newest alert ${esc(s.latestEmail)}` : ''}</p>`
    : `<p class="err">${!s.scripts ? 'The team scripts were not found on this computer.' : 'No Gmail app password on this computer (~/.config/jobsmatchnow/gmail_app_password).'}</p>`;
  const c = s.counts;
  $('#mb-counts').innerHTML = [['Jobs in your alerts', c.emailsJobs], ['To read', c.toScrape], ['Read', c.scraped], ['Other job types', c.otherTypes], ['Could not read', c.failed], ['To import', c.toImport], ['In JobFinder', c.imported]]
    .map(([l, n]) => `<span><b>${n}</b> ${esc(l)}</span>`).join('');
  $('#mb-rows').innerHTML = s.rows.length ? s.rows.map((r) => { const [txt, cls] = MB_SCRAPE[r.scrape] || [r.scrape.startsWith('failed') ? 'Could not read' : r.scrape, r.scrape.startsWith('failed') ? 'err' : 'none'];
    return `<tr><td>${esc(r.date)}</td><td><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title || 'Job')}</a><small>${esc([r.company, r.location].filter(Boolean).join(' · '))}</small></td><td><span class="tag ${cls}" title="${esc(r.scrape)}">${esc(txt)}</span></td><td>${r.imported === 'created' ? '<span class="tag ok">Added</span>' : r.imported === 'duplicate' ? '<span class="tag sugg">Already there</span>' : r.imported ? `<span class="tag err" title="${esc(r.imported)}">Not imported</span>` : ''}</td></tr>`; }).join('')
    : '<tr><td colspan="4" class="hint">No alerts read yet: press “Do all 3 steps”.</td></tr>';
  const running = s.run && !s.run.finishedAt;
  document.querySelectorAll('[data-mb]').forEach((b) => { b.disabled = running || !s.ready && ['fetch', 'all'].includes(b.dataset.mb); });
  if (s.run) { const log = $('#mb-log'); log.hidden = false; log.textContent = `${s.run.log.join('\n')}${running ? '\n…working' : `\n${s.run.exit ? '✖ stopped' : '✔ done'} (${new Date(s.run.finishedAt).toLocaleTimeString()})`}`; log.scrollTop = log.scrollHeight; }
  clearTimeout(mbTimer);
  if (running && state.tab === 'mailbox') mbTimer = setTimeout(() => void loadMailbox(), 2500);
}
document.querySelectorAll('[data-mb]').forEach((b) => b.addEventListener('click', async () => {
  const step = b.dataset.mb;
  if (['import', 'all'].includes(step) && !confirm('Import the read jobs into the JobFinder account? They are published at once in My Jobs list (duplicates are skipped).')) return;
  try { await api('/api/mailbox/run', { method: 'POST', body: { step } }); toast('Started: progress below'); } catch (e) { toast(e.message); }
  void loadMailbox();
}));// Library "Send all to JobFinder" (2026-11-26): every saved job not sent yet → JobFinder account (import key, no
// sign-in), published in My Jobs list; JobsMatchNow skips duplicates; each job is remembered as sent.
async function refreshSendAll() {
  try {
    const { jobs } = await api('/api/jobs');
    const left = jobs.filter((j) => !j.sentTo?.remoteId).length;
    const btn = $('#lib-send-all');
    btn.textContent = left ? `Send all to JobFinder (${left})` : 'All sent to JobFinder';
    btn.disabled = !left;
  } catch { /* library not loaded */ }
}
$('#lib-send-all').addEventListener('click', async () => {
  const st = await api('/api/jmn/import-status').catch(() => ({ ready: false }));
  if (!st.ready) return toast('No import key on this computer: ask for ~/.config/jobsmatchnow/import.key to be set up');
  const { jobs } = await api('/api/jobs');
  const todo = jobs.filter((j) => !j.sentTo?.remoteId);
  if (!todo.length) return toast('Every library job is already in JobFinder');
  if (!confirm(`Send ${todo.length} library job(s) to ${st.base} → JobFinder account?\n\nThey are published at once in My Jobs list. Jobs already listed (same link, or same title + company + place) are skipped.`)) return;
  const btn = $('#lib-send-all'); btn.disabled = true; const out = $('#lib-send-out');
  const n = { created: 0, duplicate: 0, failed: 0 }; const failed = [];
  for (const [i, j] of todo.entries()) {
    btn.textContent = `Sending ${i + 1} of ${todo.length}…`;
    out.innerHTML = `<p class="hint">${n.created} added · ${n.duplicate} already there · ${n.failed} not sent</p>`;
    let r;
    try { r = await api('/api/jmn/import-job', { method: 'POST', body: { id: j.id } }); }
    catch (e) { r = { status: 'failed', message: e.message }; }
    if (r.retry) { await new Promise((ok) => setTimeout(ok, 65000)); try { r = await api('/api/jmn/import-job', { method: 'POST', body: { id: j.id } }); } catch (e) { r = { status: 'failed', message: e.message }; } }
    n[r.status] = (n[r.status] || 0) + 1;
    if (r.status === 'failed') failed.push(`${j.title || 'Job'}: ${r.message}`);
    if (i < todo.length - 1) await new Promise((ok) => setTimeout(ok, 2100)); // under JobsMatchNow's 30 a minute
  }
  out.innerHTML = `<p class="sr-done"><b>${n.created}</b> added to the JobFinder account · ${n.duplicate} already there · ${n.failed} not sent. <a href="${esc(st.base)}/app/" target="_blank" rel="noopener">Open My Jobs list</a></p>${failed.length ? `<details><summary>Not sent (${failed.length})</summary><ul>${failed.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}`;
  await loadLibrary(); await refreshSendAll();
});
refreshSendAll();
