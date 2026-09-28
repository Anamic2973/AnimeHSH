/* Track A — FDE Core. Parts in this folder are concatenated in name order by build.py.
   Block types: concept {h, what, analogy, why, how, example, code, table, pitfalls},
   glossary {terms}, walkthrough {h, steps}, plus visual/text/list/code/table/quiz/refs.
   Quiz tuple: [question, options, correctIndex, explanation]. */
window.__A = [];
window.__modA = function (num, title, summary, blocks) {
  window.__A.push({ id: 'a' + num, num, title, short: 'A' + num, summary, kind: 'module', blocks });
};
