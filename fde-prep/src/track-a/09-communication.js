__modA(9, "Customer communication", "The communication half of the FDE job, made concrete: architecture docs and the C4 model, ADRs, demos, weekly status updates, escalations, saying no, handling scope changes, and setting expectations about AI accuracy.", [
  { type: "visual", h: "Handling a scope-change request", tag: "Visual", caption: "Never say yes or no on the spot. Turn the request into a trade-off the customer chooses, then write the decision down. Concept 6 walks through each step.", mermaid: `
flowchart TD
  A["New request from customer"] --> B["1. Restate the underlying need<br/>'So the goal is...?'"]
  B --> C{"2. Does it serve the<br/>agreed success metric?"}
  C -->|no| D["Park it in the backlog;<br/>explain why; revisit at next milestone"]
  C -->|yes| E["3. Estimate impact:<br/>time, risk, cost"]
  E --> F["4. Offer options:<br/>swap / extend date / phase 2"]
  F --> G["5. Owner decides"]
  G --> H["6. Write it down:<br/>change log + updated plan"]
` },

  { type: "concept", tag: "Concept 1", h: "Architecture documents and the C4 model",
    what: "An **architecture document** explains how a system is built and why, for people who need to approve, operate or extend it. The **C4 model** is a simple way to draw architecture at four zoom levels: **Context** (your system as one box, with the users and external systems around it), **Container** (the deployable pieces: web app, API, worker, database, LLM provider), **Component** (the main parts inside one container) and **Code** (rarely needed).",
    why: "Security reviewers, the customer's architects and their operations team all need to understand your system before they approve or support it. A clear one-to-three page document with the right diagrams often cuts weeks off a security review, and it's how you're perceived as the trusted technical lead rather than a contractor.",
    how: [
      "**Start with the audience:** security (data flows, trust boundaries, storage, retention), ops (how to deploy, monitor, recover), architects (components, integrations, decisions).",
      "**Context diagram:** users (adjusters), your system, external systems (claims system, Entra ID, LLM endpoint).",
      "**Container diagram:** each deployable unit and data store, the protocols between them (HTTPS, SQL), and where trust boundaries are.",
      "**Data flow section:** what data goes where, whether it's stored, for how long, and whether PII is involved.",
      "**Failure modes:** what happens if the LLM, database or source system is down.",
      "**Decisions:** link the ADRs (Concept 2)."
    ],
    table: { cols: ["Section", "Example content"], rows: [
      ["Purpose & scope", "Extract 12 fields from motor claims with citations; adjusters review in the claims system."],
      ["Context", "Adjusters → Claims Extractor → Claims System API, Entra ID (SSO), Azure OpenAI (UK South)."],
      ["Containers", "API (Container App), Worker (Container App), Postgres (private endpoint), Blob Storage, Key Vault."],
      ["Data flow & retention", "Documents read from the claims system, never copied to external services. Extracted fields stored 90 days. Traces redacted; 30-day retention."],
      ["Security", "SSO + app roles, managed identity, private networking, no public endpoints, encryption at rest (platform keys)."],
      ["Failure modes", "LLM down → jobs queue and retry for 2 h, then adjusters fill forms manually (as today). Source API down → alert, nothing is lost."],
      ["Operations", "Dashboards, alerts, runbook links, on-call contact during the pilot."]
    ] },
    pitfalls: [
      "One giant diagram with every box and arrow. Use the right zoom level for each audience.",
      "Diagrams without a legend, or arrows without labels. Say what flows along each arrow."
    ] },

  { type: "concept", tag: "Concept 2", h: "Architecture Decision Records (ADRs)",
    what: "An ADR is a short document (half a page) recording one significant technical decision: the context, the decision, the alternatives considered, and the consequences. ADRs are numbered and kept with the code (for example `docs/adr/0007-pgvector.md`), and they're never edited after acceptance. A changed decision gets a new ADR that supersedes the old one.",
    why: "Six months later someone will ask “why didn't you use a proper vector database?”. The ADR answers in 30 seconds with the constraints at the time. It also forces you to actually compare options, and it's excellent interview material (“walk me through a decision you made”).",
    code: `
# ADR-007: Use pgvector instead of a dedicated vector database

Status: Accepted, 2026-03-02        Deciders: FDE lead, customer platform architect

## Context
~2 M chunks, peak 40 queries/s. The customer already runs Postgres 16 with HA, backups
and monitoring. Document-level permissions must be enforced at query time.

## Decision
Store embeddings in pgvector (HNSW index) in the existing Postgres, next to document
metadata and permission tables.

## Alternatives considered
- Managed vector DB: scales past ~50 M vectors, but it's a new vendor (security review
  ~8 weeks) and permissions would be duplicated across two stores.
- OpenSearch k-NN: good hybrid search, but the customer has no OpenSearch skills to run it.

## Consequences
+ One datastore; permission filters are SQL joins; existing backup and monitoring apply.
- Revisit if the corpus exceeds ~20 M chunks or p95 search latency exceeds 150 ms.
`,
    pitfalls: [
      "Writing ADRs for trivial choices. Record decisions that are costly to reverse or likely to be questioned.",
      "Only listing the chosen option. The alternatives section is the valuable part."
    ] },

  { type: "concept", tag: "Concept 3", h: "Running a demo that builds trust",
    what: "A demo shows stakeholders the system working on their problem. A good FDE demo is a **story in the customer's own workflow** with a before/after number, not a tour of features.",
    why: "Demos are where executives decide whether to fund the next phase. A confusing or fragile demo can end a project that is actually working, and a clear one can unlock budget even for a rough prototype.",
    how: [
      "**Open with the problem and baseline** (1 min): “Today, Maria spends 25 minutes per claim reading attachments.”",
      "**Show the workflow as the user lives it** (5–8 min): a real, anonymised claim goes in, and fields are pre-filled with clickable citations to the source page.",
      "**Show the number** (1 min): “On 200 historical claims: 94% field accuracy; the pilot target is 10 minutes per claim.”",
      "**Show one failure handled well** (1 min): a blurry scan, where the system flags low confidence and asks the adjuster. This answers the unspoken question “what happens when it's wrong?”.",
      "**Close with the decision you need** (1 min): “We propose a 6-week pilot with 8 adjusters. We need X and Y from you by Friday.”",
      "**Prepare:** rehearse, fix the data and prompt versions, pre-warm caches, have a recorded backup video, and test on the actual network and screen you'll present on."
    ],
    example: "If the live demo breaks: say what happened calmly (“the connection to the test system dropped”), switch to the recorded backup within 30 seconds, keep telling the story, and follow up afterwards with a short note on the cause. Don't debug in front of executives.",
    pitfalls: [
      "Showing the admin UI and configuration instead of the user's workflow.",
      "Demoing on perfect sample data, which the customer will see through.",
      "Ending without a clear ask."
    ] },

  { type: "concept", tag: "Concept 4", h: "Weekly status updates",
    what: "A short written update (usually weekly) to the sponsor and stakeholders covering progress against the plan, the metric, risks and the decisions needed. Often a “RAG status”: **R**ed / **A**mber / **G**reen.",
    why: "It prevents surprises, which executives hate more than bad news. It creates a written record of what was agreed and flagged, and it keeps the project visible so it doesn't lose priority.",
    code: `
Subject: Claims Extractor — weekly update (week 4 of 10) — AMBER

Metric:   median handling time 14.2 min (baseline 25, target <10). Accuracy 93% (guardrail 92%).
Adoption: 7 of 8 pilot adjusters used it daily.

Done this week
- Rotated-scan fix shipped; accuracy on scanned PDFs 81% -> 92%.
- Added the two most-requested fields (tow company, police reference).

Next week
- Speed up review screen (adjusters say 3 clicks per field is too many).

Risks / blockers
- AMBER: production security review not yet scheduled. Need: security contact by Wed,
  otherwise go-live moves from week 10 to week 12.

Decisions needed
- Approve adding property claims to phase 2 scope (estimate attached)? Owner: Sarah (COO).
`,
    pitfalls: [
      "Green, green, green… then suddenly red. Flag amber early.",
      "Long narrative updates. Keep it to half a page with the metric at the top."
    ] },

  { type: "concept", tag: "Concept 5", h: "Escalations",
    what: "Escalation means raising a problem to someone with more authority or resources because you can't resolve it at your level, or because the impact is high enough that they need to know. It covers two cases: **incidents** (something is broken now) and **blockers** (something is stopping progress, such as missing access or an unresponsive team).",
    why: "Escalating too late turns a small delay into a missed deadline. Escalating badly (vague, emotional, blaming) damages relationships. A crisp escalation gets help fast and makes you look in control.",
    how: [
      "**Escalate when:** a customer-visible impact exists, a deadline is at risk and you've tried the normal path, or you need a decision above your authority.",
      "**Lead with impact and status,** then facts, then what you're doing, then what you need, then when you'll update next.",
      "**No speculation and no blame.** Say what you know and what you don't know yet.",
      "**Give a time for the next update** and keep it, even if there's no news."
    ],
    code: `
BAD:  "Hey, something's wrong with the extraction thing, the LLM is being weird again,
       I think it's the provider's fault. Looking into it."

GOOD: "INCIDENT — Claims extraction degraded for EU users since 10:40 UTC.
       Impact: ~120 claims queued, not lost; adjusters can fill forms manually meanwhile.
       Cause (confirmed): LLM provider quota exceeded after yesterday's traffic increase.
       Action: quota increase requested (ticket #4471); switching queued jobs to the
       secondary deployment now.
       Need: approval from Raj to use the secondary region for 24 h.
       Next update: 11:30 UTC."
`,
    pitfalls: [
      "Waiting until you've fully diagnosed the problem before telling anyone.",
      "Escalating in a public channel when a direct message to the owner would do (or the reverse, hiding an outage)."
    ] },

  { type: "concept", tag: "Concept 6", h: "Saying no and managing scope changes",
    what: "Customers will keep asking for more. **Saying no** well means turning “no” into “yes, if…” or “not now, because…”, tied to the agreed metric and timeline. **Scope change management** means making the cost of each new request visible, letting the right person decide, and writing the decision down.",
    why: "Unmanaged requests (scope creep) are the most common way FDE projects miss deadlines and fail to show value: the team is busy on everything and finishes nothing. Handled well, saying no increases trust, because the customer sees you protecting their outcome.",
    how: [
      "**Restate the need:** “So the goal is to reduce refund handling time?” Often the real need is smaller than the request.",
      "**Check it against the agreed metric** from the spec (module 1).",
      "**Estimate the impact:** days of work, new risks (security review, new data access), cost.",
      "**Offer options:** (1) swap it for something in the current scope, (2) move the date, or (3) put it in phase 2. Give your recommendation.",
      "**Let the owner decide** (usually the sponsor, not the person who asked).",
      "**Write it down** in the change log and update the plan."
    ],
    example: "Two weeks before go-live the COO asks for automatic refunds. Your reply: “The goal is to cut refund handling time? Today the pilot answers policy questions at 91% accuracy. Automatic refunds move money, so they need approval rules, fraud checks and new evaluations, which is about 4 extra weeks. Options: (1) keep the go-live date and add *draft refund for agent approval* in phase 2, or (2) move go-live by 4 weeks. I recommend option 1: you get value on the current date and refunds follow safely.”",
    pitfalls: [
      "Saying yes to be liked, then missing the date.",
      "Saying a flat no without explaining the trade-off or offering a path.",
      "Agreeing to changes in a hallway conversation and not writing them down."
    ] },

  { type: "concept", tag: "Concept 7", h: "Setting expectations about AI accuracy",
    what: "Explaining to non-technical stakeholders what the system gets right, how often, what kinds of mistakes it makes, and what safeguards exist, in business terms and with numbers from your evals.",
    why: "Executives often expect either magic (100% correct) or disaster (“AI hallucinates”). Both lead to bad decisions. Clear, honest expectation setting early prevents the “this is useless, it made a mistake” reaction when the first error appears.",
    how: [
      "**Use your eval numbers** with context: “On 200 real claims, 94% of fields were correct; today's manual rework rate is 8%.”",
      "**Describe error types, not just rates:** “Most errors are dates on handwritten forms; the system flags those as low-confidence.”",
      "**Explain the safeguards:** citations to check against, human review, confidence flags, audit log.",
      "**Compare with the real alternative,** which is usually a busy human who also makes mistakes, not perfection.",
      "**Under-promise on autonomy:** start with “assists the adjuster”, not “replaces the adjuster”."
    ],
    pitfalls: [
      "Quoting accuracy from a vendor benchmark instead of the customer's own data.",
      "Hiding known weaknesses. They will be discovered, and trust drops sharply when they are."
    ] },

  { type: "glossary", terms: [
    ["Architecture document", "Short explanation of how a system is built and why, for reviewers and operators."],
    ["C4 model", "Four zoom levels of architecture diagrams: Context, Container, Component, Code."],
    ["Trust boundary", "Line in a diagram where data crosses between trust levels."],
    ["ADR", "Architecture Decision Record: context, decision, alternatives, consequences."],
    ["RAG status", "Red/Amber/Green project health indicator (unrelated to retrieval-augmented generation)."],
    ["Escalation", "Raising a problem to someone with more authority or resources."],
    ["Incident", "Something broken now, with user impact."],
    ["Blocker", "Something preventing progress that you can't resolve yourself."],
    ["Scope creep", "Gradual growth of requirements without matching time or resources."],
    ["Change log", "Written record of scope changes and who approved them."],
    ["Sponsor", "The executive who owns the outcome and makes scope and budget decisions."]
  ] },

  { type: "walkthrough", h: "Real FDE scenario: the steering-committee meeting that goes sideways", tag: "Scenario", steps: [
    ["The setup", "Week 6 of a pilot. In the monthly steering meeting, the customer's CTO says: “88% accuracy isn't good enough. We can't put this in front of staff.”"],
    ["Don't argue, clarify", "“That's fair to raise. Can I check what 'good enough' means here? Is it the overall rate, or specific kinds of mistakes you're worried about?” The CTO's real concern: wrong policy numbers being quoted to customers."],
    ["Bring the facts", "You show the error breakdown from the evals: 88% fully correct, 9% incomplete (missing a detail), 3% wrong. All wrong answers were on 2 of 40 policies with complex tables, and every answer shows its citation, so agents catch these in review."],
    ["Offer options", "(1) Exclude the 2 table-heavy policies from the assistant until the table parsing fix ships (2 weeks), which raises the correct rate on in-scope questions to 97%. (2) Keep human review mandatory for all numeric answers. (3) Pause the pilot. Recommendation: 1 + 2."],
    ["Close and document", "The CTO agrees to options 1 + 2 with a re-review in 3 weeks. That afternoon you send a written summary of the decision, the owners and the date, and add it to the change log. The next weekly update reports progress on exactly that concern."]
  ] },

  { type: "list", h: "Hands-on task (60 minutes)", tag: "Task", ordered: true, items: [
    "Write a one-to-two page architecture document for your agentic platform: context diagram, container diagram (Mermaid is fine), data flow with retention, security, failure modes.",
    "Write one ADR for a real decision you made (for example LangGraph vs a custom loop, or Langfuse vs another tracer), including 2 alternatives.",
    "Write a weekly status update for your current project using the template in Concept 4.",
    "Write an escalation for: “The LLM provider rate-limited us; 30% of requests have failed for the last 20 minutes.”"
  ] },

  { type: "list", h: "Practice questions", tag: "Practice", ordered: true, items: [
    "The customer's CTO says your accuracy (88%) is “not good enough” in the steering meeting. Write what you say, word for word, for the next two minutes.",
    "Your live demo breaks in front of executives. What do you do in the next 60 seconds, and what do you send afterwards?",
    "A customer engineer keeps requesting bespoke features that won't generalise to other customers. How do you handle it with them, and what do you tell your own product team?"
  ] },

  { type: "quiz", qs: [
    ["What should the first line of an incident update contain?", ["The root cause analysis", "Impact and current status", "Who is to blame", "A technical deep dive"], 1, "Impact → status → facts → actions → needs → next update time."],
    ["Which C4 level shows your API, worker, database and LLM provider as separate boxes?", ["Context", "Container", "Component", "Code"], 1, "Container = deployable units and data stores."],
    ["What does an ADR capture that a design doc often doesn't?", ["Code listings", "The alternatives that were rejected and the consequences of the decision", "Team names", "Pricing"], 1, "The “why not” is what future readers need."],
    ["A customer asks for a feature that doesn't serve the agreed metric. Best response?", ["Build it to keep them happy", "Refuse flatly", "Explain the trade-off against the metric and timeline, offer options, let the owner decide", "Ignore it"], 2, "Make the cost visible, recommend, document the decision."],
    ["Why show one handled failure in a demo?", ["It fills time", "It shows the system degrades safely, which answers the stakeholders' biggest worry", "Customers like bugs", "It's legally required"], 1, "“What happens when it's wrong?” is always on their mind."],
    ["When should you flag a project as amber?", ["Only when a deadline is missed", "As soon as a risk to the plan appears that you can't resolve yourself", "Never, it looks bad", "At the end of the project"], 1, "Early warnings give the sponsor time to help."],
    ["Best way to state accuracy to an executive?", ["“It's 94% accurate”", "Eval result on their data, compared with today's baseline, with the main error types and safeguards", "Vendor benchmark scores", "“It rarely makes mistakes”"], 1, "Numbers, context, error types, safeguards."]
  ] },

  { type: "refs", items: [["The C4 model — diagrams and notation", "https://c4model.com/"], ["ADR templates and examples (Michael Nygard format and others)", "https://github.com/joelparkerhenderson/architecture-decision-record"], ["Google SRE book — Managing incidents", "https://sre.google/sre-book/managing-incidents/"]] }
]);
