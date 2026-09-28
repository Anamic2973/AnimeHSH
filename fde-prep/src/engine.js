/* Study-track engine: renders window.TRACK (roadmap, modules, quizzes, progress). */
(function () {
  'use strict';
  const T = window.TRACK;
  const KEY = 'fdeprep:' + T.key;
  const THEME_KEY = 'fdeprep:theme';
  const $ = (s, r) => (r || document).querySelector(s);

  // ---------- state (per-viewer, browser only) ----------
  let S = {};
  try { S = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { S = {}; }
  ['done', 'quiz', 'struggled', 'solved'].forEach(k => { S[k] = S[k] || {}; });
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } };

  const items = T.items;
  const modules = items.filter(i => i.kind !== 'checkpoint');
  const byId = Object.fromEntries(items.map(i => [i.id, i]));

  // ---------- tiny markdown ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function md(s) {
    if (s == null) return '';
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  const paras = s => String(s).split(/\n\s*\n/).map(p => '<p>' + md(p.trim()).replace(/\n/g, '<br>') + '</p>').join('');
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const head = b => b.h ? `<h3>${b.tag ? `<span class="tag">${esc(b.tag)}</span>` : ''}${md(b.h)}</h3>` : '';

  // ---------- theme ----------
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  let theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch (e) {}
  applyTheme(theme);
  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  const themeIcon = () => { $('#themeBtn').textContent = isDark() ? '☀' : '☾'; };
  $('#themeBtn').onclick = () => {
    theme = isDark() ? 'light' : 'dark';
    applyTheme(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    themeIcon();
    route(true);
  };
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (!theme) { themeIcon(); route(true); } };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }
  themeIcon();
  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');

  // ---------- mermaid ----------
  let mermaidReady = false;
  function initMermaid() {
    if (!window.mermaid) return false;
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: isDark() ? 'dark' : 'default', flowchart: { useMaxWidth: true, htmlLabels: true } });
    mermaidReady = true;
    return true;
  }
  async function renderDiagrams(root) {
    const nodes = [...root.querySelectorAll('.diagram[data-src]')];
    if (!nodes.length) return;
    if (!initMermaid()) {
      nodes.forEach(n => { n.innerHTML = '<pre class="code mermaid-src"></pre><p class="small muted">Diagram library offline — Mermaid source shown. Paste it into mermaid.live to view.</p>'; n.firstChild.textContent = n.dataset.src; });
      return;
    }
    for (const [i, n] of nodes.entries()) {
      try {
        const { svg } = await window.mermaid.render('mmd-' + Date.now() + '-' + i, n.dataset.src);
        n.innerHTML = svg;
        const vb = n.querySelector('svg') && n.querySelector('svg').viewBox.baseVal;
        if (vb && vb.width > 700) n.classList.add('wide');
      } catch (err) {
        n.innerHTML = '<pre class="code mermaid-src"></pre>';
        n.firstChild.textContent = n.dataset.src;
      }
    }
  }

  // ---------- block renderers ----------
  const R = {
    visual(b) {
      const f = el('section', 'block');
      f.innerHTML = head(b) + '<figure class="visual"><div class="diagram"></div><figcaption></figcaption></figure>';
      $('.diagram', f).dataset.src = b.mermaid;
      $('figcaption', f).innerHTML = md(b.caption || '') + ' <span>Source: ' + (b.source ? md(b.source) : 'diagram drawn for this guide') + '.</span>';
      return f;
    },
    text(b) { return el('section', 'block', head(b) + paras(b.body)); },
    callout(b) { return el('section', 'block callout', head(b) + paras(b.body)); },
    // concept card: plain-English definition → why → how → example → pitfalls
    concept(b) {
      const row = (label, html) => html ? `<div class="c-row"><div class="c-label">${label}</div><div class="c-body">${html}</div></div>` : '';
      const list = (xs, ordered) => xs && xs.length ? `<${ordered ? 'ol' : 'ul'}>` + xs.map(x => '<li>' + md(x) + '</li>').join('') + `</${ordered ? 'ol' : 'ul'}>` : '';
      const s = el('section', 'block concept',
        `<h3><span class="tag">${esc(b.tag || 'Concept')}</span>${md(b.h)}</h3>` +
        row('What it is', b.what && paras(b.what)) +
        row('Think of it as', b.analogy && paras(b.analogy)) +
        row('Why it matters', b.why && paras(b.why)) +
        row('How it works', Array.isArray(b.how) ? list(b.how, true) : b.how && paras(b.how)) +
        row('Example', (b.example ? paras(b.example) : '') + (b.code ? '<pre class="code"><code></code></pre>' : '') + (b.table ? '<div class="table-wrap"><table><thead><tr>' + b.table.cols.map(c => '<th>' + md(c) + '</th>').join('') + '</tr></thead><tbody>' + b.table.rows.map(r => '<tr>' + r.map(c => '<td>' + md(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' : '')) +
        row('Watch out', list(b.pitfalls)));
      if (b.code) $('pre.code code', s).textContent = b.code.replace(/^\n/, '');
      return s;
    },
    glossary(b) {
      return el('section', 'block', '<h3><span class="tag">Glossary</span>Key terms in this module</h3><div class="table-wrap"><table><thead><tr><th>Term</th><th>Plain-English meaning</th></tr></thead><tbody>' +
        b.terms.map(([t, d]) => `<tr><td><b>${md(t)}</b></td><td>${md(d)}</td></tr>`).join('') + '</tbody></table></div>');
    },
    walkthrough(b) {
      return el('section', 'block callout', head(b) + '<ol class="walk">' + b.steps.map(([t, d]) => `<li><b>${md(t)}</b><div>${paras(d)}</div></li>`).join('') + '</ol>');
    },
    csnote(b) { return el('section', 'block csnote', '<h3><span class="tag">C# → Python</span></h3><ul>' + b.items.map(i => '<li>' + md(i) + '</li>').join('') + '</ul>'); },
    list(b) {
      const t = b.ordered ? 'ol' : 'ul';
      return el('section', 'block', head(b) + `<${t}>` + b.items.map(i => '<li>' + md(i) + '</li>').join('') + `</${t}>`);
    },
    code(b) {
      const s = el('section', 'block', head(b) + '<pre class="code"><code></code></pre>' + (b.note ? '<p class="small muted" style="margin-top:10px">' + md(b.note) + '</p>' : ''));
      $('pre.code code', s).textContent = b.code.replace(/^\n/, '');
      return s;
    },
    table(b) {
      return el('section', 'block', head(b) + '<div class="table-wrap"><table><thead><tr>' + b.cols.map(c => '<th>' + md(c) + '</th>').join('') +
        '</tr></thead><tbody>' + b.rows.map(r => '<tr>' + r.map(c => '<td>' + md(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
    },
    refs(b) {
      return el('section', 'block', '<h3><span class="tag">Read</span>Diagrams &amp; references</h3><ul>' +
        b.items.map(([l, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${md(l)}</a></li>`).join('') + '</ul>');
    },
    problems(b, item) {
      const s = el('section', 'block', head(Object.assign({ h: 'Question set', tag: 'Practice' }, b)) +
        '<p class="small muted">Tick a problem when you have solved it on your own (no HINT / SOLUTION). 🔒 = LeetCode Premium; the same problem is free on NeetCode or LintCode.</p>' +
        '<div class="table-wrap"><table><thead><tr><th></th><th>#</th><th>Problem</th><th>Difficulty</th><th>Asked at</th><th>List</th></tr></thead><tbody></tbody></table></div>');
      const tb = $('tbody', s);
      b.rows.forEach((r, i) => {
        const [title, slug, diff, asked, list, premium] = r;
        const tr = el('tr', S.solved[slug] ? 'solved' : '');
        tr.innerHTML = `<td class="chk"><input type="checkbox" aria-label="solved"${S.solved[slug] ? ' checked' : ''}></td><td>${i + 1}</td>` +
          `<td><a href="https://leetcode.com/problems/${esc(slug)}/" target="_blank" rel="noopener">${esc(title)}</a>${premium ? ' 🔒' : ''}</td>` +
          `<td><span class="diff ${esc(diff)}">${esc(diff)}</span></td><td>${md(asked || 'commonly reported')}</td><td class="small">${md(list || '')}</td>`;
        $('input', tr).onchange = e => {
          if (e.target.checked) S.solved[slug] = true; else delete S.solved[slug];
          tr.className = e.target.checked ? 'solved' : '';
          save(); renderNav(item.id);
        };
        tb.appendChild(tr);
      });
      return s;
    },
    quiz(b, item) {
      const qs = b.qs;
      const s = el('section', 'block quiz', `<h3><span class="tag">Quiz</span>${md(b.h || 'Check yourself')} <span class="muted small">· ${qs.length} questions</span></h3>`);
      const state = new Array(qs.length).fill(null);
      const answers = [];
      const score = el('span', 'score');
      qs.forEach((q, qi) => {
        const [text, rawOpts, rawAns, why] = q;
        // shuffle options so the correct answer's position carries no signal
        const order = rawOpts.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        const opts = order.map(i => rawOpts[i]);
        const ans = order.indexOf(rawAns);
        answers[qi] = ans;
        const card = el('div', 'q', `<p class="q-text"><b>Q${qi + 1}.</b> ${md(text)}</p><div class="opts"></div><p class="why" hidden></p>`);
        const box = $('.opts', card);
        opts.forEach((o, oi) => {
          const btn = el('button', 'opt', `<span class="letter">${'ABCDEF'[oi]}</span><span>${md(o)}</span>`);
          btn.onclick = () => {
            if (state[qi] !== null) return;
            state[qi] = oi;
            [...box.children].forEach((c, ci) => {
              c.disabled = true;
              if (ci === ans) c.classList.add('correct'); else if (ci === oi) c.classList.add('wrong');
            });
            const w = $('.why', card);
            w.hidden = false;
            w.innerHTML = (oi === ans ? '<b class="ok">Correct.</b> ' : '<b class="no">Not quite.</b> ') + md(why);
            update();
          };
          box.appendChild(btn);
        });
        s.appendChild(card);
      });
      const foot = el('div', 'quiz-foot');
      const prev = S.quiz[item.id];
      const best = el('span', 'muted small', prev ? `Best so far: ${prev.best}/${prev.total}` : '');
      const retry = el('button', 'btn', 'Retry quiz');
      retry.onclick = () => route(true);
      foot.append(score, best, retry);
      s.appendChild(foot);
      function update() {
        const answered = state.filter(x => x !== null).length;
        const right = state.filter((x, i) => x === answers[i]).length;
        score.textContent = `Score: ${right}/${answered}` + (answered < qs.length ? ` (${qs.length - answered} left)` : '');
        if (answered === qs.length) {
          const p = S.quiz[item.id];
          S.quiz[item.id] = { last: right, best: Math.max(right, p ? p.best : 0), total: qs.length };
          best.textContent = `Best so far: ${S.quiz[item.id].best}/${qs.length}`;
          save(); renderNav(item.id);
        }
      }
      update();
      return s;
    }
  };

  // ---------- progress ----------
  function pct() { return Math.round(100 * modules.filter(m => S.done[m.id]).length / modules.length); }
  const label = i => (i.kind === 'checkpoint' ? '' : i.num + '. ') + i.title;
  function progressBlock() {
    const done = modules.filter(m => S.done[m.id]);
    const last = done[done.length - 1];
    const next = modules.find(m => !S.done[m.id]);
    const struggled = [];
    items.forEach(i => {
      const q = S.quiz[i.id];
      if (S.struggled[i.id] && S.struggled[i.id].trim()) struggled.push(`${i.short || i.title}: ${S.struggled[i.id].trim().replace(/\s*\n\s*/g, '; ')}`);
      if (q && q.last / q.total < 0.7) struggled.push(`${i.short || i.title} quiz ${q.last}/${q.total}`);
    });
    const solved = Object.keys(S.solved).length;
    return [
      'PROGRESS',
      `Track | ${T.key} — ${T.name}`,
      `Module done | ${last ? label(last) : 'none yet'}${done.length ? ` (${done.length}/${modules.length} complete)` : ''}${T.showSolved ? ` · ${solved} problems solved` : ''}`,
      `Topics I struggled with | ${struggled.length ? struggled.join(' · ') : 'none recorded'}`,
      `Next module | ${next ? label(next) : 'track complete'}`
    ].join('\n');
  }
  function copy(text, btn) {
    const done = () => { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = o; }, 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() {
      const ta = el('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      ta.remove();
    }
  }

  // ---------- nav ----------
  function status(i) {
    if (i.kind === 'checkpoint') return S.quiz[i.id] ? '✅' : '🧩';
    return S.done[i.id] ? '✅' : '⬜';
  }
  function renderNav(active) {
    const side = $('#side');
    let html = `<a class="nav${active === 'home' ? ' active' : ''}" href="#home"><span class="st">🗺</span>Roadmap</a>` +
      `<a class="nav${active === 'progress' ? ' active' : ''}" href="#progress"><span class="st">📋</span>Progress &amp; commands</a>`;
    let group = null;
    items.forEach(i => {
      if (i.group !== group) { group = i.group; if (group) html += `<h4>${md(group)}</h4>`; }
      const q = S.quiz[i.id];
      html += `<a class="nav${i.kind === 'checkpoint' ? ' checkpoint' : ''}${active === i.id ? ' active' : ''}" href="#${i.id}"><span class="st">${status(i)}</span><span>${md(label(i))}</span>` +
        (q ? `<span class="sc">${q.best}/${q.total}</span>` : '') + '</a>';
    });
    html += '<h4>Other tracks</h4><div class="tracks">' + T.otherTracks.map(([l, f]) => `<a href="${esc(f)}">${md(l)}</a>`).join('') + '<a href="index.html">All tracks</a></div>';
    side.innerHTML = html;
    $('#barFill').style.width = pct() + '%';
    $('#barText').textContent = modules.filter(m => S.done[m.id]).length + '/' + modules.length;
  }

  // ---------- views ----------
  function viewHome(main) {
    main.appendChild(el('div', 'hero', `<div class="kicker">Track ${esc(T.key)}</div><h1>${md(T.name)}</h1>${paras(T.intro)}`));
    const rm = el('section', 'block', '<h3><span class="tag">Roadmap</span>Fixed path — one module per session</h3><ul class="roadmap"></ul>');
    const ul = $('ul', rm);
    items.forEach(i => {
      const q = S.quiz[i.id];
      const li = el('li', '', `<span>${status(i)}</span><a href="#${i.id}">${md(label(i))}</a><span class="sc">${q ? 'quiz ' + q.best + '/' + q.total : ''}</span>`);
      ul.appendChild(li);
    });
    main.appendChild(rm);
    (T.homeBlocks || []).forEach(b => main.appendChild(R[b.type](b, { id: 'home' })));
  }
  function viewProgress(main) {
    main.appendChild(el('div', 'hero', `<div class="kicker">Track ${esc(T.key)}</div><h1>Progress &amp; commands</h1><p class="muted">Paste this block at the start of your next tutor session to resume exactly where you left off.</p>`));
    const pb = el('section', 'block', '<h3><span class="tag">Resume</span>PROGRESS block</h3><pre class="code progress-block"></pre><div class="row" style="margin-top:12px"></div>');
    $('pre', pb).textContent = progressBlock();
    const c = el('button', 'btn primary', 'Copy PROGRESS block');
    c.onclick = () => copy(progressBlock(), c);
    const next = modules.find(m => !S.done[m.id]);
    const st = el('button', 'btn', next ? `Copy “START: ${T.cmd} ${next.num}”` : 'Track complete');
    if (next) st.onclick = () => copy(`START: ${T.cmd} ${next.num}`, st);
    $('.row', pb).append(c, st);
    main.appendChild(pb);
    main.appendChild(el('section', 'block', '<h3><span class="tag">Tutor</span>Commands</h3><div class="cmds">' + [
      ['START: ' + T.cmd + ' <n>', 'Begin module n of this track directly'],
      ['NEXT', 'Move to the next module or question'],
      ['HINT', 'Next hint only — never the full answer'],
      ['SOLUTION', 'Full optimal solution with explanation'],
      ['SIMPLER', 'Re-explain with a simpler analogy'],
      ['DEEPER', 'One level deeper: internals, edge cases, trade-offs'],
      ['REVISE', 'Quick recap of everything done in this track'],
      ['ROADMAP', 'Full path with ✅ for completed modules']
    ].map(([k, v]) => `<code>${esc(k)}</code><span>${esc(v)}</span>`).join('') + '</div>'));
    const reset = el('section', 'block', '<h3>Reset</h3><p class="muted small">Progress lives only in this browser. Resetting clears ticks, quiz scores and notes for this track.</p>');
    const rb = el('button', 'btn', 'Reset this track');
    rb.onclick = () => { if (confirm('Clear all progress for this track?')) { S = { done: {}, quiz: {}, struggled: {}, solved: {} }; save(); route(); } };
    reset.appendChild(rb);
    main.appendChild(reset);
  }
  function viewItem(main, item) {
    const idx = items.indexOf(item);
    main.appendChild(el('div', 'hero', `<div class="kicker">${item.group ? md(item.group) + ' · ' : ''}${item.kind === 'checkpoint' ? 'Checkpoint' : 'Module ' + item.num + ' of ' + modules.length}</div><h1>${md(item.title)}</h1>${item.summary ? '<p class="muted">' + md(item.summary) + '</p>' : ''}`));
    item.blocks.forEach(b => {
      if (!R[b.type]) return;
      main.appendChild(R[b.type](b, item));
    });
    if (item.kind !== 'checkpoint') {
      const end = el('section', 'block', '<h3><span class="tag">Wrap-up</span>End of session</h3><p class="small muted">Note anything that felt shaky — it goes into your PROGRESS block.</p><textarea placeholder="Topics I struggled with…"></textarea><div class="row" style="margin-top:12px"></div>');
      const ta = $('textarea', end);
      ta.value = S.struggled[item.id] || '';
      ta.oninput = () => { S.struggled[item.id] = ta.value; save(); };
      const db = el('button', 'btn' + (S.done[item.id] ? ' done' : ' primary'), S.done[item.id] ? '✅ Module done' : 'Mark module done');
      db.onclick = () => {
        if (S.done[item.id]) delete S.done[item.id]; else S.done[item.id] = Date.now();
        save(); route(true);
      };
      const pb = el('button', 'btn', 'Copy PROGRESS block');
      pb.onclick = () => copy(progressBlock(), pb);
      const sb = el('button', 'btn', `Copy “START: ${T.cmd} ${item.num}”`);
      sb.onclick = () => copy(`START: ${T.cmd} ${item.num}`, sb);
      $('.row', end).append(db, pb, sb);
      main.appendChild(end);
    }
    const pager = el('div', 'pager');
    const prev = items[idx - 1], next = items[idx + 1];
    pager.innerHTML = (prev ? `<a class="btn" href="#${prev.id}">← ${md(label(prev))}</a>` : '<span></span>') +
      (next ? `<a class="btn primary" href="#${next.id}">${md(label(next))} →</a>` : '');
    main.appendChild(pager);
  }

  function route(keepScroll) {
    const id = decodeURIComponent(location.hash.slice(1)) || 'home';
    const main = $('#main');
    const y = window.scrollY;
    main.innerHTML = '';
    if (id === 'progress') viewProgress(main);
    else if (byId[id]) viewItem(main, byId[id]);
    else viewHome(main);
    renderNav(byId[id] || id === 'progress' ? id : 'home');
    document.title = (byId[id] ? label(byId[id]) + ' · ' : '') + T.title;
    document.body.classList.remove('nav-open');
    if (keepScroll === true) window.scrollTo(0, y); else window.scrollTo(0, 0);
    renderDiagrams(main);
  }

  $('#trackName').textContent = T.name;
  window.addEventListener('hashchange', () => route());
  route();
})();
