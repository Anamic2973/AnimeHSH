# FDE Interview Prep

Self-contained study pages for three fixed learning tracks. Open any HTML file directly in a browser — no server needed.

| File | Track | Contents |
|---|---|---|
| `index.html` | Hub | Links to all tracks with progress bars |
| `track-a-fde-core.html` | A — FDE Core | 10 modules, 71 concept cards (what it is → why it matters → how it works → example → pitfalls), glossary per module, day-by-day FDE scenario, hands-on task, 3 practice questions, quiz |
| `track-b-dsa.html` | B — DSA | 20 patterns, 200 LeetCode problems, Python templates, pattern quizzes, 7 "name the pattern" checkpoints |
| `track-c-system-design.html` | C — System Design | 8 fundamentals, 14 classic designs, 12 AI/LLM designs in the 8-step interview structure, with quizzes |

## Features

- **Roadmap** with ✅ per module, progress bar, and quiz best scores.
- **Quizzes** on every module; options are shuffled on each attempt.
- **PROGRESS block** generator (Track | Module done | Topics I struggled with | Next module) to paste into the next tutor session, plus a `START: <track> <n>` copy button.
- Problem tables in Track B with solved checkboxes and LeetCode links.
- Mermaid diagrams (loaded from jsDelivr; if offline, the diagram source is shown instead).
- Light/dark theme. Progress is stored in the browser's `localStorage` only.

## Editing

The HTML files are generated. Edit the sources in `src/` and rebuild:

```sh
python3 build.py
```

- `src/engine.js`, `src/engine.css`, `src/shell.html` — shared renderer (roadmap, quizzes, progress).
- `src/track-a/` — Track A content, one file per module, concatenated in name order.
- `src/track-b.js`, `src/track-c.js` — Track B and C content.
- Block types: `concept` {h, what, analogy, why, how, example, code, table, pitfalls}, `glossary`, `walkthrough`, `visual` (Mermaid), `text`, `list`, `code`, `table`, `quiz`, `refs`. Quiz entries are `[question, options, correctIndex, explanation]`.

## Notes on Track B data

- "Asked at" says **commonly reported** unless a company is verified; LeetCode company tags change and require Premium.
- "List" marks problems that are in NeetCode 150; others are well-known LeetCode classics.
- 🔒 marks LeetCode Premium problems (free equivalents exist on NeetCode / LintCode).
