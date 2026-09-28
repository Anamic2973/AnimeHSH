__modA(10, "End-to-end case studies", "Putting modules 1–9 together: a repeatable 7-step method for “Customer wants X” problems, one fully worked case (support tickets), a second worked case (contract review), and what interviewers score.", [
  { type: "visual", h: "Case: “We want AI to handle our support tickets” — target architecture", tag: "Visual", caption: "The design reached at step 4 of the worked case below. Each box traces back to a module: webhook + queue (3), LangGraph + RAG (5), guardrails + HITL (7), tracing + golden set (6), Azure deployment (8).", mermaid: `
flowchart LR
  ZD["Zendesk<br/>webhook: ticket.created"] --> API["Ingest API<br/>verify signature, dedupe"]
  API --> Q[["Queue"]]
  Q --> W["LangGraph worker"]
  W --> CL["Classify intent,<br/>urgency, language"]
  CL --> RAG["Retrieve help-centre +<br/>similar resolved tickets"]
  RAG --> DR["Draft reply<br/>with citations"]
  DR --> GR{"Guardrails +<br/>confidence"}
  GR -->|"phase 2: safe intent,<br/>high confidence"| AUTO["Auto-reply"]
  GR -->|"otherwise"| AG["Draft shown to agent<br/>in Zendesk sidebar"]
  AG --> FB["Agent edits / sends<br/>= feedback label"]
  W -.->|traces| LF["Langfuse"]
  FB -.->|"new eval cases"| LF
` },

  { type: "concept", tag: "Concept 1", h: "The 7-step method for any “Customer wants X” problem",
    what: "A repeatable structure for FDE case interviews and for real engagements. It takes you from a vague ask to a plan the customer can approve, and stops you from jumping straight to architecture, which is the most common mistake candidates make.",
    how: [
      "**Clarify the business goal:** who has the problem, how often, what it costs today (the baseline), and why now.",
      "**Define success:** one primary metric with a target, plus guardrails (quality, safety, cost).",
      "**Scope a thin slice:** the narrowest end-to-end version that moves the metric. Say explicitly what is out of scope.",
      "**Design:** data flow and components; where the LLM is used and where deterministic code is better; integrations, auth, human-in-the-loop points.",
      "**Identify risks:** data access and quality, security and privacy, accuracy, adoption. Give each a mitigation.",
      "**Plan:** weekly milestones with exit criteria (demo → pilot → production).",
      "**Measure and expand:** how you'll prove value, what you monitor, and what you do next if it works."
    ],
    table: { cols: ["Step", "Time in a 45-min case interview", "Module it draws on"], rows: [
      ["1–2 Clarify + success", "~8 min", "1"],
      ["3 Scope", "~4 min", "1"],
      ["4 Design", "~15 min", "2, 3, 4, 5, 8"],
      ["5 Risks", "~6 min", "4, 7"],
      ["6 Plan", "~5 min", "1, 9"],
      ["7 Measure", "~5 min", "6"]
    ] },
    pitfalls: [
      "Starting with “I'd use GPT-X with LangGraph and Pinecone” before asking a single question.",
      "Designing the full vision instead of the first slice.",
      "Forgetting that humans must adopt it: no training, no feedback loop."
    ] },

  { type: "concept", tag: "Concept 2", h: "What interviewers score in an FDE case",
    what: "FDE case interviews (sometimes called “decomposition” or “customer scenario” interviews) test whether you can act as the technical lead in front of a customer. They are scored on judgment and structure as much as technical depth.",
    table: { cols: ["Dimension", "Strong signal", "Weak signal"], rows: [
      ["Problem framing", "Asks about workflow, volume, baseline, users; restates the problem", "Jumps to a solution"],
      ["Business sense", "Picks a metric the customer cares about; thin slice with clear value", "Measures model accuracy only"],
      ["Technical design", "Concrete components, data flow, auth, failure modes; uses LLMs only where they help", "Buzzwords; LLM for everything"],
      ["Risk & safety", "Data access, PII, injection, human review, evals named proactively", "Not mentioned until prompted"],
      ["Pragmatism", "Uses the customer's existing systems; phases the work", "Rebuilds everything; big-bang launch"],
      ["Communication", "Structured, checks in, handles pushback calmly", "Monologue; defensive under pushback"]
    ] },
    why: "Knowing the rubric tells you where to spend your 45 minutes: framing and scoping are heavily weighted, and candidates who skip them rarely recover even with a great architecture.",
    pitfalls: [
      "Ignoring interviewer hints. They often play the customer and drop constraints (“our data can't leave the EU”) that you must incorporate."
    ] },

  { type: "walkthrough", h: "Worked case 1: “We want AI to handle our support tickets”", tag: "Worked case", steps: [
    ["Step 1 — Clarify", "Questions and the answers you get: Volume? **18,000 tickets/month.** Team? **40 agents.** Channels? **Email and web form, all in Zendesk.** Current performance? **Median first response 9 hours; CSAT 4.4/5.** What are the tickets about? **The top 10 intents are 62% of volume (order status, password reset, invoice copy, returns…).** Knowledge? **Help centre in Zendesk Guide plus internal Confluence pages.** Constraints? **EU data residency; Azure; SSO with Entra ID.** Why now? **Volume up 40% this year, no new headcount.**"],
    ["Step 2 — Define success", "Primary metric: **median first-response time 9 h → 1 h** within 3 months. Guardrails: **CSAT stays ≥ 4.3**, **zero incorrect refunds or account changes**. Adoption: **≥ 70% of drafts sent with no or minor edits** for in-scope intents."],
    ["Step 3 — Scope the thin slice", "Draft replies (not automatic sending) for the top 3 intents: order status, password reset, invoice copy (~30% of volume). The agent reviews and sends from a Zendesk sidebar. **Out of scope for now:** auto-sending, refunds, phone channel, languages other than English and German."],
    ["Step 4 — Design", "Zendesk sends a `ticket.created` **webhook** → the ingest API verifies the signature, dedupes by ticket ID and enqueues (module 3). A **LangGraph worker** classifies intent and language (small, fast model), retrieves from the help centre and similar resolved tickets with **hybrid search** (module 5), and for order status calls a **read-only order tool** scoped to the ticket's customer ID. It drafts a reply with **citations** and returns **structured output** (draft, intent, confidence, citations). **Guardrails** check PII and policy (module 7). The draft appears in a Zendesk sidebar app; the agent's edits are logged as feedback. Everything is **traced in Langfuse** (module 6) and deployed in the customer's **Azure EU tenant** using Azure OpenAI in an EU region, Key Vault and Container Apps (module 8)."],
    ["Step 5 — Risks and mitigations", "**Data access:** Zendesk API token and Confluence export requested in week 1. **Knowledge quality:** 15% of help articles are outdated, so their owner reviews the top 50 articles referenced in drafts. **Accuracy:** a golden set of 200 labelled historical tickets, evaluated on every change. **Prompt injection via ticket text:** the tools are read-only, scoped to the ticket's own customer, and nothing is sent without an agent. **Adoption:** 5 agents co-design the sidebar; weekly feedback session. **PII:** redaction before tracing; 30-day trace retention."],
    ["Step 6 — Plan", "**Week 1:** access, data export, golden set labelling with 2 senior agents. **Week 2:** retrieval + drafting, offline eval (target: 80% of drafts rated sendable). **Week 3:** Zendesk sidebar, tracing, security review submission. **Weeks 4–7:** pilot with 5 agents, weekly metric report. **Week 8:** production decision against the exit criteria (first response < 2 h for in-scope intents, CSAT ≥ 4.3, 70% draft acceptance)."],
    ["Step 7 — Measure and expand", "Weekly: first-response time (pilot agents vs the rest as a comparison group), CSAT, draft acceptance by intent, cost per ticket. **Expansion rule:** an intent whose drafts are sent unchanged more than 90% of the time for 4 weeks becomes a candidate for auto-reply with 10% sampled human review. Next intents are added by volume. Product feedback: “intent-level autonomy controls” is a feature request for the core platform."]
  ] },

  { type: "walkthrough", h: "Worked case 2 (shorter): a law firm wants contract review", tag: "Worked case", steps: [
    ["Clarify", "The firm reviews ~600 supplier contracts a month against its internal playbook (48 clause rules, such as “liability cap ≥ 12 months of fees”, “no auto-renewal over 1 year”). A junior lawyer takes ~2 hours per contract. Contracts arrive as Word files or PDFs. Strict confidentiality: no data may be used for training, and it must stay in their tenant."],
    ["Success", "Primary: review time per contract **2 h → 45 min**. Guardrail: **no missed critical deviations** (must-pass cases) on a 100-contract golden set labelled by senior associates."],
    ["Thin slice", "Supplier contracts only; the 12 most important playbook rules (not all 48); output = a list of deviations, each with the clause text quoted and the playbook rule it breaks. The lawyer decides; nothing is sent to the counterparty."],
    ["Design", "Parse DOCX/PDF, preserving clause numbering → split into clauses → for each playbook rule, retrieve candidate clauses (hybrid search within the one contract) → an LLM checks each (rule, clause) pair with **structured output** (complies / deviates / not present, with a quoted citation) → a review UI in their document system. Deterministic code handles the numeric rules (dates, amounts) wherever possible."],
    ["Risks", "Recall on critical rules matters more than precision, so tune toward flagging. Unusual clause wording needs a golden set with many phrasings. Confidentiality: in-tenant model deployment, zero retention, no traces containing contract text outside the tenant."],
    ["Measure", "Per-rule precision and recall on the golden set (module 6); time per contract from their matter-management system; lawyer override rate per rule, which shows where the prompts and rules need work."]
  ] },

  { type: "list", h: "Hands-on task (60 minutes, timed like an interview)", tag: "Task", ordered: true, items: [
    "Case: a logistics company says “We want an AI agent that reads carrier emails and updates shipment ETAs in our TMS (transport management system).”",
    "Set a 45-minute timer. Work through all 7 steps in writing: clarifying questions (with plausible answers you invent), metric and guardrails, thin slice, architecture diagram, risks, a 6-week plan, measurement.",
    "Then record yourself presenting it in 10 minutes.",
    "Bring it to the tutor session: I'll play the customer's COO and push back on scope, accuracy and security."
  ] },

  { type: "list", h: "Practice cases (full 7-step answers)", tag: "Practice", ordered: true, items: [
    "A manufacturer wants technicians to “chat with our maintenance manuals” on tablets on the shop floor, where Wi-Fi is poor and manuals are scanned PDFs with diagrams.",
    "A bank wants to automate KYC document checks for new business accounts (company registration documents, IDs of directors, proof of address) in 3 countries.",
    "An insurer wants to use AI to detect potentially fraudulent claims, but its compliance team insists every decision must be explainable and reviewed by a person."
  ] },

  { type: "quiz", qs: [
    ["In a “customer wants X” case, what should come before any architecture?", ["Choosing the LLM", "Clarifying the goal and baseline, and agreeing a success metric", "Drawing the database schema", "Estimating GPU needs"], 1, "Interviewers weight framing heavily; a design without a metric can't be judged."],
    ["Why start support automation with agent-facing drafts rather than auto-replies?", ["Drafts are cheaper", "They collect labelled feedback and prove accuracy with low risk before any autonomy", "Customers dislike AI", "Zendesk requires it"], 1, "Every accepted or edited draft is an evaluation label; autonomy is earned per intent."],
    ["Best primary metric for the support case?", ["Number of LLM calls", "Median first-response time, with CSAT as a guardrail", "Tokens per ticket", "Number of intents supported"], 1, "A business outcome the customer already tracks, protected by a quality guardrail."],
    ["Which risk most often delays FDE projects in weeks 1–2?", ["Model choice", "Data and system access (credentials, network, approvals)", "Frontend framework", "Code style"], 1, "Request access on day 1; it gates everything else."],
    ["When is it right to move an intent from drafts to auto-reply?", ["When the demo looks good", "After sustained, measured acceptance above a threshold, with sampled review continuing", "Immediately for all intents", "Never"], 1, "Evidence-based autonomy, per intent, with ongoing monitoring."],
    ["In the contract-review case, why tune toward recall on critical rules?", ["It's cheaper", "A missed critical deviation is far costlier than a false flag a lawyer can dismiss", "Precision doesn't matter at all", "Lawyers prefer more work"], 1, "Match the error trade-off to the business cost of each error type."]
  ] }
]);
