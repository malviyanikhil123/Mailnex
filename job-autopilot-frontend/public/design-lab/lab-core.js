/* Shared toolkit for the design lab: sample data, helpers, 3D stage and the preview bar.
   Each design owns its own markup, CSS, layout and interactions. */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
  const REGION = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
  const SPECIAL = { remote: 'Remote', latam: 'Latin America', eu: 'Europe (anywhere)', unknown: 'Not stated' };
  const cname = (c) => { const k = String(c).toLowerCase(); if (SPECIAL[k]) return SPECIAL[k]; try { return REGION.of(k.toUpperCase()); } catch { return k.toUpperCase(); } };
  const ago = (h) => h < 1 ? 'just now' : h < 24 ? h + 'h ago' : Math.round(h / 24) + (Math.round(h / 24) === 1 ? ' day ago' : ' days ago');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Sample data — made-up companies, shaped like the real API.
  const jobs = [
    { id: 1, title: 'IT Business Analyst', company: 'Northwind Bank', loc: 'London', cc: 'gb', remote: false, pay: '£45–55k', h: 3, src: 'greenhouse', fit: 92, tags: ['SQL', 'Jira', 'Agile'] },
    { id: 2, title: 'Business Systems Analyst', company: 'Kestrel Pay', loc: 'London · Hybrid', cc: 'gb', remote: false, pay: '£50–60k', h: 7, src: 'ashby', fit: 88, tags: ['Payments', 'UML'] },
    { id: 3, title: 'Product Analyst', company: 'Lumen Health', loc: 'Paris', cc: 'fr', remote: false, pay: '€46–52k', h: 11, src: 'lever', fit: 81, tags: ['Figma', 'Analytics'] },
    { id: 4, title: 'Junior Business Analyst', company: 'Tandem Retail', loc: 'Berlin', cc: 'de', remote: false, pay: '', h: 19, src: 'arbeitnow', fit: 86, tags: ['Requirements', 'Scrum'] },
    { id: 5, title: 'Requirements Analyst', company: 'Brightline Insurance', loc: 'Dublin', cc: 'ie', remote: false, pay: '€42k', h: 26, src: 'greenhouse', fit: 79, tags: ['BPMN', 'Stakeholders'] },
    { id: 6, title: 'Business Analyst', company: 'Maple Ledger', loc: 'Remote · Europe', cc: 'remote', remote: true, pay: '$55–65k', h: 30, src: 'remotive', fit: 84, tags: ['SaaS', 'Jira'] },
    { id: 7, title: 'Business Analyst', company: 'Fennec Logistics', loc: 'Bengaluru', cc: 'in', remote: false, pay: '₹12–16 LPA', h: 34, src: 'jooble', fit: 90, tags: ['ERP', 'SQL'] },
    { id: 8, title: 'Associate Product Owner', company: 'Harbor Mobility', loc: 'Singapore', cc: 'sg', remote: false, pay: 'S$5.5–6.5k/mo', h: 45, src: 'greenhouse', fit: 76, tags: ['Backlog', 'Agile'] },
    { id: 9, title: 'IT Business Analyst', company: 'Solace Travel', loc: 'Remote · Worldwide', cc: 'remote', remote: true, pay: '', h: 52, src: 'himalayas', fit: 83, tags: ['Travel tech', 'APIs'] },
    { id: 10, title: 'Business Analyst (CRM)', company: 'Juniper Foods', loc: 'Kuala Lumpur', cc: 'my', remote: false, pay: 'RM 7–9k/mo', h: 60, src: 'jooble', fit: 74, tags: ['Salesforce', 'CRM'] },
    { id: 11, title: 'Product Owner – Data', company: 'Quarry Labs', loc: 'New York', cc: 'us', remote: false, pay: '$85–95k', h: 70, src: 'lever', fit: 68, tags: ['Data', 'Roadmaps'] },
    { id: 12, title: 'Business Analyst', company: 'Orbit Freight', loc: 'Madrid', cc: 'es', remote: false, pay: '€38k', h: 90, src: 'arbeitnow', fit: 72, tags: ['Logistics', 'Excel'] },
  ];
  const sources = [
    { name: 'LinkedIn job alerts', kind: 'email', seen: 212, kept: 31, ok: 'ok', h: 1 },
    { name: 'Jooble · London', kind: 'api', seen: 180, kept: 17, ok: 'ok', h: 1 },
    { name: 'Arbeitnow (EU)', kind: 'feed', seen: 640, kept: 27, ok: 'ok', h: 2 },
    { name: 'Remotive', kind: 'feed', seen: 95, kept: 9, ok: 'ok', h: 2 },
    { name: 'Himalayas', kind: 'feed', seen: 120, kept: 20, ok: 'ok', h: 3 },
    { name: 'Greenhouse boards (14)', kind: 'career pages', seen: 900, kept: 12, ok: 'ok', h: 3 },
    { name: 'Lever boards (6)', kind: 'career pages', seen: 310, kept: 5, ok: 'ok', h: 4 },
    { name: 'Naukri job alerts', kind: 'email', seen: 0, kept: 0, ok: 'failed', note: 'Login expired', h: 20 },
    { name: 'Adzuna', kind: 'api', seen: 0, kept: 0, ok: 'waiting', note: 'Needs a free key', h: 0 },
  ];
  const byCountry = [['gb', 10], ['remote', 7], ['fr', 5], ['de', 4], ['ie', 4], ['in', 3], ['us', 3], ['my', 2], ['sg', 2], ['ca', 1], ['es', 1]].map(([country, n]) => ({ country, n }));
  const DATA = {
    totals: { jobs: 48, pool: 3035, companies: 649, countries: 36, today: 12 },
    byCountry, jobs, sources,
    daily: [0, 0, 2, 0, 5, 1, 0, 3, 0, 7, 0, 26, 10, 12],
    profile: { name: 'Charul Purohit', first: 'Charul', email: 'you@example.com', city: 'Jodhpur, India', level: 'Junior', years: 2.3, degree: 'B.Tech, Computer Science',
      roles: ['IT Business Analyst', 'Business Analyst', 'Business Systems Analyst', 'Product Analyst', 'Product Owner', 'Requirements Analyst'],
      skipYears: 5, skipDegrees: ['Master', 'MBA', 'M.Tech', 'PhD'], never: ['Intellidata Tech Solutions'], salary: null },
  };

  const PLACE = { gb: [54, -2], us: [39, -98], de: [51, 10], in: [22, 79], fr: [46.5, 2.5], sg: [1.35, 103.8], ie: [53.3, -8], ca: [57, -101], es: [40, -3.7], my: [4, 102], jp: [36, 138], au: [-25, 134], ae: [24, 54] };
  const HOME = [26.24, 73.02];

  /* ---------- 3D helpers ---------- */
  const T = window.THREE;
  const vec = (lat, lng, r) => { const p = (90 - lat) * Math.PI / 180, t = (lng + 180) * Math.PI / 180;
    return new T.Vector3(-r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t)); };
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let glow = null;
  const glowTex = () => { if (glow) return glow; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return (glow = new T.CanvasTexture(c)); };
  const sprite = (color, size) => { const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); s.scale.setScalar(size); return s; };

  /** A renderer mounted in `host`, with pointer parallax and a per-frame hook. */
  function stage(host, opts) {
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: opts.alpha !== false });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    host.appendChild(renderer.domElement);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(opts.fov || 40, 1, 0.1, 300);
    camera.position.copy(opts.cam);
    const look = opts.look || new T.Vector3();
    const pointer = { x: 0, y: 0 };
    const onMove = (e) => { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = -(e.clientY / innerHeight * 2 - 1); };
    addEventListener('pointermove', onMove);
    const resize = () => { const r = host.getBoundingClientRect(); if (!r.width) return; renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();
    const base = camera.position.clone();
    const api = { scene, camera, renderer, pointer, base, look, hooks: [], alive: true };
    let last = performance.now();
    const loop = (now) => {
      if (!api.alive) return; requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
      if (!reduce && opts.parallax !== false) {
        camera.position.x += (base.x + pointer.x * (opts.px ?? 0.6) - camera.position.x) * 0.05;
        camera.position.y += (base.y + pointer.y * (opts.py ?? 0.4) - camera.position.y) * 0.05;
      }
      camera.lookAt(look);
      api.hooks.forEach((f) => f(dt, now / 1000));
      renderer.render(scene, camera);
    };
    requestAnimationFrame(loop);
    api.tick = (f) => api.hooks.push(f);
    api.dispose = () => { api.alive = false; ro.disconnect(); removeEventListener('pointermove', onMove); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
    return api;
  }

  /* ---------- screens, states and the preview bar ---------- */
  const SCREENS = [['login', 'Sign in'], ['signup', 'Sign up'], ['loading', 'Loading'], ['overview', 'Overview'], ['jobs', 'Jobs'], ['sources', 'Sources'], ['profile', 'My profile'], ['kit', 'UI kit']];
  const STATES = [['ok', 'Loaded'], ['skeleton', 'Skeleton'], ['empty', 'Empty'], ['error', 'Error']];

  function toast(msg, kind) {
    let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.setAttribute('role', 'status'); t.innerHTML = msg;
    box.appendChild(t); requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, 3200);
  }

  function devbar(current) {
    const bar = document.createElement('div');
    bar.id = 'devbar';
    bar.innerHTML = '<style>#devbar{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:9999;display:flex;gap:4px;align-items:center;flex-wrap:wrap;justify-content:center;' +
      'max-width:calc(100vw - 24px);padding:6px 8px;border-radius:12px;background:rgba(20,20,22,.9);color:#ddd;font:12px/1 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.35)}' +
      '#devbar a,#devbar button{border:0;background:transparent;color:#bbb;padding:6px 8px;border-radius:7px;font:inherit;cursor:pointer;text-decoration:none}' +
      '#devbar a:hover,#devbar button:hover{color:#fff;background:rgba(255,255,255,.08)}#devbar .on{background:#fff;color:#111}#devbar i{width:1px;height:18px;background:#444;margin:0 4px}' +
      '#devbar .hideb{opacity:.6}#devbar.min>*:not(.hideb){display:none}</style>' +
      '<a href="./">← All designs</a><i></i>' +
      SCREENS.map(([k, v]) => '<button data-s="' + k + '">' + v + '</button>').join('') + '<i></i>' +
      STATES.map(([k, v]) => '<button data-st="' + k + '">' + v + '</button>').join('') +
      '<button class="hideb" title="Hide this bar">✕</button>';
    document.body.appendChild(bar);
    bar.querySelector('.hideb').onclick = () => bar.classList.toggle('min');
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.classList.contains('hideb')) return;
      if (b.dataset.s) go(b.dataset.s, current.state === 'ok' ? 'ok' : current.state);
      if (b.dataset.st) go(current.screen, b.dataset.st);
    });
    return bar;
  }

  const current = { screen: 'login', state: 'ok' };
  let design = null;
  function mark() {
    $$('#devbar [data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === current.screen));
    $$('#devbar [data-st]').forEach((b) => b.classList.toggle('on', b.dataset.st === current.state));
  }
  function go(screen, state) {
    current.screen = screen || 'login'; current.state = state || 'ok';
    history.replaceState(null, '', '#' + current.screen + (current.state !== 'ok' ? '/' + current.state : ''));
    design.show(current.screen, current.state);
    mark();
  }
  function start(d) {
    design = d;
    devbar(current);
    const [s, st] = location.hash.slice(1).split('/');
    go(SCREENS.some(([k]) => k === s) ? s : 'login', STATES.some(([k]) => k === st) ? st : 'ok');
    addEventListener('hashchange', () => { const [a, b] = location.hash.slice(1).split('/'); if (a !== current.screen || (b || 'ok') !== current.state) go(a, b); });
  }

  window.Lab = { $, $$, esc, fmt, cname, ago, reduce, DATA, PLACE, HOME, vec, rand, sprite, glowTex, stage, toast, go, start, current, SCREENS, STATES };
})();
