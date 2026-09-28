__modA(1, "The FDE role", "What a Forward Deployed Engineer does, and how to turn a vague business ask into a scoped, measurable project: discovery, baselines, thin slices, specs, demos, pilots, and working inside a customer's environment.", [
  { type: "visual", h: "The FDE engagement loop", tag: "Visual", caption: "Read left to right. Each box is a stage explained in a concept card below. The loop back from Measure means you expand scope only after the first slice has proven value.", mermaid: `
flowchart LR
  A["Vague ask<br/>'We want AI for claims'"] --> B["Discovery<br/>learn the real workflow,<br/>pain, data, people"]
  B --> C["Scoping<br/>pick ONE measurable<br/>thin slice"]
  C --> D["Spec + demo<br/>1-page spec, demo on<br/>their real data"]
  D --> E["Pilot<br/>real users, real env,<br/>measured vs baseline"]
  E --> F["Production<br/>hardening, handover,<br/>support"]
  F --> G["Measure<br/>did the number move?"]
  G -->|"expand to next slice"| C
  G -->|"patterns seen at many customers"| H["Core product team"]
` },

  { type: "concept", tag: "Concept 1", h: "What a Forward Deployed Engineer is",
    what: "A Forward Deployed Engineer (FDE) is a software engineer who works directly with one customer (or a few) to make the company's product solve that customer's real problem. “Forward deployed” is a military phrase: you are placed out in the field, close to the problem, instead of back at headquarters.\n\nYou write real production code: integrations, data pipelines, agents, UIs. But nobody hands you a ticket saying what to build. You start from a business problem, find out what is actually going on, decide what to build, build it inside the customer's systems, and prove it worked.",
    analogy: "A product engineer builds a car in the factory. An FDE drives to the customer's farm, finds out they actually need to pull a trailer through mud, fits the tow hitch and winter tyres, teaches the farmer to use it, and phones the factory saying “every farm customer needs a tow hitch, make it standard”.",
    why: "AI products rarely work out of the box in a large company. The data is messy, the workflow is unusual, security rules are strict, and the people are unsure what the product can do. Companies like Palantir, OpenAI, Anthropic, Scale AI and many AI startups hire FDEs because a deal only turns into lasting revenue once someone makes the product deliver measurable value on the customer's side.",
    how: [
      "**Understand the business problem.** Talk to users, watch them work, and collect numbers.",
      "**Decide what to build.** Pick the smallest thing that moves an important number (the “thin slice”).",
      "**Build it in their environment.** Deal with their identity provider, network, data and security review.",
      "**Prove it worked.** Measure against the baseline and report to the executive sponsor.",
      "**Feed back to product.** If you build the same thing for three customers, it should become a product feature, not more custom code."
    ],
    table: { cols: ["", "Product software engineer", "Forward Deployed Engineer", "Solutions / sales engineer"], rows: [
      ["Input", "A ticket or spec", "A business problem", "A prospect's questions"],
      ["Output", "Product features", "A working deployment + measured impact", "A demo and a closed deal"],
      ["Writes production code?", "Yes", "Yes, in the customer's environment", "Rarely"],
      ["Success measured by", "Features shipped, quality", "The customer's metric moved; account grows", "Revenue closed"]
    ] },
    pitfalls: [
      "Behaving like a consultant who only writes slides. FDEs are judged on working software.",
      "Behaving like a contractor who builds whatever is asked. Your job is to find out what should be built.",
      "Building one-off custom code for everything. Push reusable parts back into the product."
    ] },

  { type: "concept", tag: "Concept 2", h: "Discovery: finding out what is really going on",
    what: "Discovery is the first phase of an engagement. You interview people and watch them work to understand four things: (1) the current workflow, step by step, (2) where it hurts, measured in numbers, (3) who is involved and what they want, and (4) what data and systems exist.\n\nThe output is not a feature list. It is a clear problem statement, a baseline number, and a map of the people, data and constraints.",
    why: "Customers usually describe a solution (“we want a chatbot”) rather than the problem (“new staff can't find the right policy, so each ticket takes 20 minutes longer”). If you build the solution they named, you often solve the wrong problem. Discovery is where you find the real one.",
    how: [
      "**Book 45–60 minutes with the people who do the work,** not only their managers. Managers describe the process as it should be; the people doing it describe how it actually is.",
      "**Ask “last time” questions.** “Walk me through the last claim you processed, from the moment it arrived.” A specific recent case gives real steps, tools and delays. A general question gets an idealised answer.",
      "**Ask for numbers at each step.** How many per week? How long does each take? How often does it go wrong, and what does a mistake cost?",
      "**Ask “why” until you reach the root cause.** “Why does that step take 20 minutes?” → “Because I have to search three systems.” → “Why three?” → “Because policy documents were never migrated.”",
      "**Watch them do it if you can (“shadowing”).** People forget the workarounds they use every day.",
      "**Ask about data and access.** Where does each input live? Who owns it? Can we get a sample this week?",
      "**End with the success question:** “In 90 days, if this worked, what number would be different?”",
      "**Write it up the same day** and send it back: “Here's what I heard, is it correct?” This catches misunderstandings early and builds trust."
    ],
    example: "Weak question: “What features would you like in an AI assistant?” (gets a wish list)\n\nStrong question: “Show me the last three tickets you escalated. What were you looking for, where did you look, and how long did it take?” (gets the real workflow, the real systems and real timings)",
    pitfalls: [
      "Pitching the product during discovery. You stop listening and they start telling you what they think you want to hear.",
      "Only talking to the executive sponsor. Execs know the goal; users know the workflow.",
      "Leaving without numbers. Without a baseline, you can never prove impact later.",
      "Accepting “everything is a priority”. Make them rank the problems."
    ] },

  { type: "concept", tag: "Concept 3", h: "Baseline and success metric",
    what: "The **baseline** is how the process performs today, measured in numbers (for example: 25 minutes per claim, 8% rework rate). The **success metric** is the one number that should improve if your project works, with a target (for example: under 10 minutes per claim).\n\nYou usually also define one or two **guardrail metrics**. These are numbers that must NOT get worse while you improve the main one (for example: accuracy must not drop).",
    why: "The metric is what everything else hangs on. It tells you what to build first, gives you grounds to say no to requests that don't serve it, and at the end it proves your value to the executive who pays for the renewal. “Users liked it” does not renew a contract. “Handling time dropped from 25 to 9 minutes, which saves 2.1 FTE” does.",
    how: [
      "**Choose a number the business already cares about:** time, cost, error rate, revenue, backlog, customer satisfaction (CSAT).",
      "**Measure the baseline before you build anything.** Use system logs (ticket timestamps), a time study (time 20 real cases) or existing reports.",
      "**Set a target with the sponsor:** a specific value and a date.",
      "**Add a guardrail** so you can't “win” by breaking something else (faster but wrong).",
      "**Agree how it will be measured.** Which data source? Who calculates it? How often?"
    ],
    table: { cols: ["Type", "Example", "Why you need it"], rows: [
      ["Primary metric", "Median claim handling time: 25 min → < 10 min by end of Q2", "Defines success; drives priorities"],
      ["Guardrail metric", "Field accuracy ≥ 92% (today's human rework rate is 8%)", "Stops you optimising speed by sacrificing quality"],
      ["Adoption metric", "≥ 70% of adjusters use it weekly", "A great tool nobody uses has no impact"],
      ["Leading indicator", "Share of drafts accepted with minor edits", "Moves early, before the business metric shows it"]
    ] },
    pitfalls: [
      "Vanity metrics: “number of questions answered”, “tokens processed”. These measure activity, not value.",
      "Too many metrics. With five “primary” metrics you have none.",
      "No baseline. You cannot claim improvement over a number you never measured.",
      "Model metrics only (“95% accuracy”). Executives want business metrics; accuracy is a guardrail."
    ] },

  { type: "concept", tag: "Concept 4", h: "Scoping and the thin slice",
    what: "**Scoping** means deciding exactly what you will build first and, just as important, what you will not build. A **thin slice** (also called a vertical slice) is a narrow piece of functionality that works end to end, from real input to real output in the user's hands, so you can measure it.",
    analogy: "Cut a cake vertically and you get every layer (sponge, cream, icing) in a small piece you can taste. Cut it horizontally and you get only the sponge layer across the whole cake, and you can't tell yet whether the cake is any good.",
    why: "Big-bang projects (“build the whole platform, then launch”) take months before anyone sees value, and they fail in ways you only discover at the end. A thin slice delivers value in weeks, exposes the hard problems (data quality, access, adoption) early, and earns you the trust needed for the next slice.",
    how: [
      "**List the candidate problems** you found in discovery.",
      "**Score each one on value** (how much would it move the metric?) and **feasibility** (is the data available? is the risk low? can we do it in 2–6 weeks?).",
      "**Pick the high-value, high-feasibility one.** Often it is the most frequent case type, not the most interesting one.",
      "**Narrow it further:** one document type, one team, one language, one region.",
      "**Write the out-of-scope list explicitly** and get the sponsor to agree to it in writing.",
      "**Define exit criteria:** what result lets you move to the next slice or to production."
    ],
    table: { cols: ["", "Horizontal (avoid)", "Vertical thin slice (do this)"], rows: [
      ["What gets built", "The whole ingestion layer for all 40 document types", "Ingestion + extraction + review screen for the #1 document type only"],
      ["First value to a user", "Month 4+", "Week 3–4"],
      ["Can you measure impact early?", "No", "Yes, on that one document type"],
      ["Risks discovered", "Late", "Early (bad scans, missing access, user resistance)"]
    ] },
    pitfalls: [
      "Picking the most technically exciting problem instead of the most valuable one.",
      "Keeping out-of-scope items in your head instead of in writing. They come back as “but you promised”.",
      "Making the slice so thin that it no longer moves any metric."
    ] },

  { type: "concept", tag: "Concept 5", h: "The one-page spec",
    what: "A short written agreement between you and the customer about the first slice: the problem, who it is for, how success is measured, what is in and out of scope, what data you need, the constraints, the risks, and the milestones. It fits on one page so that executives actually read it.",
    why: "Verbal agreements drift. Six weeks in, different stakeholders will remember different promises. A signed-off spec settles scope arguments (“that's on the out-of-scope list we agreed on 3 March”), aligns engineering with the business, and is your first artefact as the trusted technical lead.",
    how: [
      "Draft it within 2–3 days of discovery while details are fresh.",
      "Review it with your champion first (the person on the customer side who wants this to succeed), then the sponsor.",
      "Get explicit sign-off (an email saying “approved” is enough).",
      "Update it when scope changes, and keep a short change log at the bottom."
    ],
    table: { cols: ["Section", "Filled-in example (insurance claims)"], rows: [
      ["Problem", "Adjusters spend ~25 min per claim reading 30–80 pages of attachments to fill a 12-field summary; 4,000 claims/month; 8% of summaries need rework."],
      ["Users & workflow", "40 motor-claims adjusters in the UK team. The tool pre-fills the summary form in the existing claims system; the adjuster reviews and submits."],
      ["Success metric", "Primary: median handling time 25 → under 10 min. Guardrail: field accuracy ≥ 92%. Adoption: ≥ 70% weekly use."],
      ["In scope", "Motor claims, English, PDF and scanned attachments, 12 summary fields with page citations."],
      ["Out of scope", "Claim approval decisions, fraud scoring, email ingestion, property claims (candidates for phase 2)."],
      ["Data & access", "Read-only API to the claims system; 200 anonymised historical claims for evaluation; owner: Claims Ops data team."],
      ["Constraints", "Azure UK South only; SSO via Entra ID; no customer PII in logs; security review takes about 3 weeks."],
      ["Risks", "Scan quality (owner: us, test by week 1); adjuster adoption (owner: Claims Ops lead, training plan by week 3)."],
      ["Milestones", "Week 2 demo on real claims → week 6 pilot with 8 adjusters → week 10 production decision, if the metric and guardrail are met."]
    ] },
    pitfalls: [
      "Writing ten pages. Nobody reads them.",
      "Missing the out-of-scope section. It is the most useful part.",
      "No owners or dates on risks. A risk with no owner doesn't get handled."
    ] },

  { type: "concept", tag: "Concept 6", h: "Demo vs POC vs pilot vs production",
    what: "Four stages of maturity that customers (and interviewers) often mix up:\n\n**Demo:** shows what is possible, usually driven by you, on a small, fixed dataset. **Proof of concept (POC):** answers one technical question (“can we extract these fields from scanned PDFs with ≥ 90% accuracy?”). **Pilot:** real users doing real work with the system in their environment for a limited period, measured against the baseline. **Production:** everyone who needs it uses it, with support, monitoring, security sign-off and an owner.",
    why: "Each stage has different quality requirements and different questions. If you treat a demo as production, you over-engineer and go slow. If you treat a pilot like a demo, you get no trustworthy measurement. Being clear about which stage you are in, and what gets you to the next one (the exit criteria), keeps projects from getting stuck in endless pilots.",
    table: { cols: ["Stage", "Question it answers", "Who uses it", "Typical length", "Exit criteria example"], rows: [
      ["Demo", "Could this work for us?", "You, presenting", "Days", "Sponsor agrees to a POC/pilot"],
      ["POC", "Is the risky technical part feasible?", "You + their engineers", "1–3 weeks", "≥ 90% field accuracy on 200 real claims"],
      ["Pilot", "Does it move the metric with real users?", "5–20 real users", "4–8 weeks", "Handling time < 10 min, accuracy ≥ 92%, 70% adoption"],
      ["Production", "Can the whole organisation rely on it?", "All users", "Ongoing", "Security sign-off, SLOs, support runbook, owner named"]
    ] },
    example: "Always demo on the customer's real (anonymised) data, never only on clean samples. Their scanned, rotated, handwritten documents are where things break. Showing it working on their mess is far more convincing than a polished demo on perfect PDFs.",
    pitfalls: [
      "“Pilot purgatory”: pilots with no exit criteria never end and never convert to production.",
      "Pilots without a control group or baseline, which can't prove anything.",
      "Choosing pilot users who are all enthusiasts. Include some sceptics so the results are believable."
    ] },

  { type: "concept", tag: "Concept 7", h: "Stakeholders: who you are really working with",
    what: "Stakeholders are everyone who can make your project succeed or fail. In most enterprise engagements they fall into the same roles, and each wants something different from you.",
    table: { cols: ["Role", "Who they are", "What they want", "How to work with them"], rows: [
      ["Executive sponsor", "Senior leader funding the project (for example, COO)", "Business result, low risk, no surprises", "Short updates on the metric; escalate early"],
      ["Champion", "Mid-level person who wants it to succeed and knows the organisation", "A visible win for their team", "Your daily partner; helps you get access and people"],
      ["End users", "People who will use it daily (adjusters, agents)", "Less tedious work; no extra clicks", "Shadow them; involve them in the pilot; act on feedback fast"],
      ["IT / security", "Platform, identity, network, infosec teams", "No new risk, compliance with policy", "Engage in week 1; bring an architecture doc; follow their process"],
      ["Blockers", "People whose work or status changes if this works", "To protect their role or budget", "Find them early; understand their concerns; give them a role"]
    ] },
    why: "Technically good projects fail for people reasons: security review not started, users not trained, a manager who quietly blocks adoption. Mapping stakeholders in week 1 lets you deal with these risks early, while they are still cheap to fix.",
    pitfalls: [
      "Ignoring IT/security until the end. Their review often takes 3–8 weeks.",
      "Confusing the champion with the sponsor. The champion can't approve budget or scope."
    ] },

  { type: "concept", tag: "Concept 8", h: "Working inside a customer's environment",
    what: "Enterprise customers rarely let you run their data through your own cloud. You deploy into their Azure/AWS account or on-premises servers, sign in through their identity provider, follow their change process, and work within their network and data rules.",
    why: "Access and security problems are the #1 reason FDE projects slip. The code might take 2 weeks and getting a firewall rule approved might take 4. Starting these requests on day 1 is one of the most valuable things you can do.",
    how: [
      "**Day 1 access checklist:** laptop or VDI access, accounts in their identity provider (Entra ID / Okta), a code repository, a cloud subscription or resource group, sample data.",
      "**Network:** Can the app reach your LLM provider? Enterprises often block outbound internet and route traffic through a proxy or firewall, so you need egress rules or their own model deployment (Azure OpenAI, AWS Bedrock).",
      "**Security review:** submit an architecture diagram, data-flow description, list of subprocessors (which vendors see the data) and data retention answers early.",
      "**Data rules:** where data may be stored (region), whether PII may leave the country, how long logs are kept.",
      "**Change process:** many companies only deploy to production in scheduled windows with a change ticket (CAB, change advisory board).",
      "**Handover:** who runs it after you leave? Plan documentation and training from the start."
    ],
    pitfalls: [
      "Assuming you'll have admin rights. You won't.",
      "Building against sample data for weeks because real data access wasn't requested early.",
      "Discovering in week 8 that the approved LLM region doesn't support the model you built on."
    ] },

  { type: "glossary", terms: [
    ["FDE", "Forward Deployed Engineer: an engineer embedded with customers who builds and deploys solutions and measures their impact."],
    ["Discovery", "The investigation phase: interviews, shadowing and data review to understand the real problem."],
    ["Baseline", "The measured performance of the current process before any change."],
    ["Primary metric", "The single number that defines success for the project."],
    ["Guardrail metric", "A number that must not get worse while you improve the primary metric."],
    ["Thin / vertical slice", "A narrow feature that works end to end, so its value can be measured."],
    ["Out of scope", "Things explicitly agreed as not included in the current phase."],
    ["POC", "Proof of concept: a short test of whether the risky technical part is feasible."],
    ["Pilot", "Limited real-world use by real users, measured against the baseline."],
    ["Exit criteria", "Pre-agreed results needed to move to the next stage."],
    ["Executive sponsor", "The senior person who funds the project and owns the business outcome."],
    ["Champion", "The customer-side person who actively pushes the project forward day to day."],
    ["Scope creep", "Requirements growing gradually without a matching change in time or resources."],
    ["Shadowing", "Watching a user do their real work to see steps and workarounds they wouldn't mention."]
  ] },

  { type: "walkthrough", h: "Real FDE scenario: “We want GenAI for claims”", tag: "Scenario", steps: [
    ["Day 1: the ask", "A UK insurer's COO says: “We want to use GenAI in claims.” This is a solution looking for a problem. You schedule discovery sessions with 3 adjusters, their team lead and the claims-ops data owner, and on the same day you request sandbox access and sample data."],
    ["Days 2–4: discovery", "Shadowing shows that each motor claim arrives with 30–80 pages (police reports, garage estimates, photos, emails). Adjusters read everything to fill a 12-field summary. System timestamps show a median of 25 minutes per claim across 4,000 claims a month, and QA reports show 8% of summaries need rework. Adjusters say: “The worst part is hunting through scans for the repair total and the incident date.”"],
    ["Day 5: scoping", "Candidates: summary extraction, fraud scoring, customer email drafting. Extraction scores highest: it happens on every claim, the data is available, and a human still decides, so the risk is low. Fraud scoring is valuable but needs labelled fraud data and model-risk approval, so it moves to phase 2."],
    ["Week 1: spec", "You write the one-page spec shown in Concept 5: primary metric handling time 25 → < 10 min, guardrail accuracy ≥ 92%, out of scope: decisions, fraud, email ingestion. The COO signs it off by email."],
    ["Week 2: demo on real data", "You run extraction on 20 anonymised real claims, including bad scans. Every field shows the page it came from (a “citation”) so adjusters can check it in one click. Two fields fail on rotated scans, and you show that openly along with the fix plan. Trust goes up, not down."],
    ["Weeks 3–8: pilot", "8 adjusters (including 2 sceptics) use it on live claims. Weekly you report the median time (it reaches 11 minutes by week 6), accuracy (94%) and adoption (7 of 8 use it daily). You fix the rotated-scan issue and add the two fields adjusters asked for most."],
    ["Week 10: production decision", "Exit criteria met (9.5 minutes, 94%, 88% adoption). Security sign-off is done, because you started the review in week 1. Rollout to all 40 adjusters. You also tell your product team: “Page-level citations in the review UI were the #1 trust driver — this should be a product feature.”"]
  ] },

  { type: "list", h: "Hands-on task (45 minutes)", tag: "Task", ordered: true, items: [
    "Pick a real workflow at your current job that your agentic platform could improve.",
    "Write 8 discovery questions for it. At least 3 must be “last time” questions and at least 2 must ask for a number.",
    "Fill in the one-page spec template from Concept 5. Force yourself to ONE primary metric with a baseline and target, plus one guardrail.",
    "List 3 things that are explicitly out of scope and why.",
    "Write the exit criteria for a 6-week pilot.",
    "Bring it to the tutor session. I'll critique it the way a sceptical customer CTO would."
  ] },

  { type: "list", h: "Practice questions (answer in writing, then discuss with the tutor)", tag: "Practice", ordered: true, items: [
    "A VP says: “We need an AI agent that can do everything our operations team does.” Give your first 5 discovery questions and the thin slice you would propose, and justify the slice using value and feasibility.",
    "Mid-pilot, the customer asks you to add Slack, email and Teams ingestion “since it should be easy”. Write your actual reply.",
    "Your demo works on sample data, but the customer's real PDFs turn out to be scanned images. What do you do in the next 48 hours, and what do you tell the sponsor?"
  ] },

  { type: "quiz", qs: [
    ["What is the single most important output of discovery?", ["A list of every feature the customer wants", "A baseline and one primary success metric the customer agrees with", "A choice of LLM vendor", "A project Gantt chart"], 1, "The baseline and metric decide what to build first, give you grounds to say no, and let you prove value at the end."],
    ["Which discovery question gives the most reliable information?", ["“What features would you like?”", "“Walk me through the last claim you processed, step by step.”", "“Is the process efficient?”", "“Would AI help you?”"], 1, "A specific recent case shows the real steps, tools and delays. General questions get idealised or wish-list answers."],
    ["A “thin slice” is…", ["The cheapest model you can use", "A narrow piece of functionality working end to end, so its value can be measured", "Building the backend first", "A short slide deck"], 1, "Vertical, not horizontal: every layer, for one narrow case."],
    ["What is a guardrail metric?", ["The main success number", "A number that must not get worse while you improve the main one", "A security firewall rule", "The number of users"], 1, "For example: speed goes up, but accuracy must stay ≥ 92%."],
    ["What distinguishes a pilot from a demo?", ["Pilots have nicer UIs", "Real users do real work in their environment, measured against the baseline", "Pilots use more GPUs", "There is no difference"], 1, "A demo shows what is possible; a pilot proves impact."],
    ["Which stakeholder should you engage in week 1 even though they never use the tool?", ["The CFO's assistant", "IT / security", "Marketing", "Your own sales team"], 1, "Security reviews and network changes often take weeks; they gate production."],
    ["Why should the out-of-scope list be written and signed off?", ["Legal requirement", "It settles later scope disputes and protects the timeline", "It makes the spec longer", "It isn't needed"], 1, "Unwritten exclusions come back later as “but you promised”."]
  ] },

  { type: "refs", items: [["Palantir blog — A day in the life of a Forward Deployed Software Engineer", "https://blog.palantir.com/a-day-in-the-life-of-a-palantir-forward-deployed-software-engineer-45ef2de257b1"], ["Amazon “Working Backwards” (PR/FAQ) method", "https://www.aboutamazon.com/news/workplace/an-insider-look-at-amazons-culture-and-processes"]] }
]);
