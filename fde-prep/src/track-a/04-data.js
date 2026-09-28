__modA(4, "Data", "SQL you need to write fluently, how Postgres indexes and transactions work, data modeling, ETL/ELT pipelines, and a concrete playbook for cleaning messy customer data.", [
  { type: "visual", h: "From messy customer exports to a trusted data model", tag: "Visual", caption: "Raw data is stored exactly as received. A staging layer cleans it. Good rows go to the core model, bad rows go to quarantine with a reason. Every concept below maps to one of these boxes.", mermaid: `
flowchart LR
  S1["CSV / Excel exports"] --> RAW
  S2["CRM API"] --> RAW
  S3["SharePoint PDFs"] --> RAW
  RAW[("raw<br/>append-only,<br/>exactly as received")] --> STG["staging<br/>fix types, trim, normalise,<br/>dedupe, validate"]
  STG -->|valid| CORE[("core model<br/>customers, tickets, products")]
  STG -->|invalid| Q[("quarantine<br/>row + reason")]
  CORE --> MART[("marts / features<br/>for the app, RAG, dashboards")]
  Q -.->|"fix rule or ask the data owner"| STG
` },

  { type: "concept", tag: "Concept 1", h: "SQL joins, grouping and CTEs",
    what: "A **join** combines rows from two tables using a matching column. A **GROUP BY** collapses rows into groups and computes aggregates (count, sum, average) per group. A **CTE** (Common Table Expression, `WITH name AS (...)`) is a named sub-query that makes long queries readable, step by step.",
    why: "As an FDE you constantly answer questions about customer data (“how many tickets per product last month?”, “which customers have no orders?”) and build the queries behind pipelines and dashboards. Interviewers test this directly.",
    example: "Two small tables: **customers** (1 Ana, 2 Ben, 3 Cy) and **orders** (id 10 → customer 1, total 50; id 11 → customer 1, total 30; id 12 → customer 2, total 20). Cy has no orders.",
    table: { cols: ["Join type", "Returns", "Result on the example"], rows: [
      ["`INNER JOIN`", "Only rows with a match in both tables", "Ana-10, Ana-11, Ben-12 (Cy disappears)"],
      ["`LEFT JOIN`", "All rows from the left table; NULLs where no match", "Ana-10, Ana-11, Ben-12, Cy-NULL"],
      ["Anti-join (`NOT EXISTS`)", "Left rows with NO match", "Cy"],
      ["`GROUP BY` customer with `SUM(total)`", "One row per group", "Ana 80, Ben 20 (Cy 0 with a LEFT JOIN + COALESCE)"]
    ] },
    code: `
-- Revenue per customer, including customers with no orders, only customers with > 1 order
WITH customer_orders AS (
  SELECT c.id, c.name, COUNT(o.id) AS order_count, COALESCE(SUM(o.total), 0) AS revenue
  FROM customers c
  LEFT JOIN orders o ON o.customer_id = c.id
  GROUP BY c.id, c.name
)
SELECT * FROM customer_orders
WHERE order_count > 1              -- filter on groups (same as HAVING COUNT(o.id) > 1)
ORDER BY revenue DESC;

-- Customers who never ordered (anti-join)
SELECT c.* FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
`,
    pitfalls: [
      "Putting a filter on the right table in `WHERE` after a LEFT JOIN (`WHERE o.status = 'paid'`) silently turns it into an inner join. Put it in the `ON` clause instead.",
      "Using `COUNT(*)` with a LEFT JOIN counts the NULL row as 1. Use `COUNT(o.id)`.",
      "`NOT IN (subquery)` returns nothing if the subquery contains a NULL. Prefer `NOT EXISTS`."
    ] },

  { type: "concept", tag: "Concept 2", h: "Window functions",
    what: "A window function computes a value **for each row** using a set of related rows (the “window”), **without collapsing rows** the way GROUP BY does. The syntax is `function() OVER (PARTITION BY ... ORDER BY ...)`. `PARTITION BY` splits rows into groups; `ORDER BY` orders rows within each group.",
    why: "They solve the most common analytics and data-cleaning tasks in one pass: latest record per customer, deduplication, running totals, time since the previous event, ranking. These come up in interviews all the time.",
    example: "Tickets for customer 1 created on Jan 1, Jan 5 and Jan 12. The query below adds `rn` (1 = newest) and `days_since_prev`:",
    table: { cols: ["customer_id", "created_at", "rn", "prev_created", "days_since_prev"], rows: [
      ["1", "Jan 12", "1", "Jan 5", "7"],
      ["1", "Jan 5", "2", "Jan 1", "4"],
      ["1", "Jan 1", "3", "NULL", "NULL"]
    ] },
    code: `
SELECT customer_id, created_at,
       ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn,
       LAG(created_at) OVER (PARTITION BY customer_id ORDER BY created_at)   AS prev_created,
       created_at::date
         - (LAG(created_at) OVER (PARTITION BY customer_id ORDER BY created_at))::date AS days_since_prev,
       SUM(1) OVER (PARTITION BY customer_id ORDER BY created_at)            AS running_count
FROM tickets;

-- Latest ticket per customer: keep rn = 1
SELECT * FROM (
  SELECT t.*, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn
  FROM tickets t
) x WHERE rn = 1;
`,
    how: [
      "`ROW_NUMBER()`: 1, 2, 3… within each partition. Use it for dedup and latest-per-group.",
      "`RANK()` / `DENSE_RANK()`: like ROW_NUMBER, but ties share a rank.",
      "`LAG(col)` / `LEAD(col)`: the value from the previous or next row.",
      "`SUM(col) OVER (... ORDER BY ...)`: a running total."
    ],
    pitfalls: [
      "You can't use a window result in `WHERE` of the same query. Wrap it in a subquery or CTE, as above.",
      "Forgetting a tie-breaker in `ORDER BY` (for example `, id`) makes “latest” nondeterministic when timestamps tie."
    ] },

  { type: "concept", tag: "Concept 3", h: "Indexes and reading EXPLAIN",
    what: "An **index** is a separate data structure that lets the database find rows without reading the whole table. Postgres's default is a **B-tree**: a sorted, balanced tree of the indexed column values, each pointing to its row.",
    analogy: "A phone book sorted by (last name, first name). Finding “Smith, Anna” is fast. Finding everyone named “Smith” is fast. Finding everyone named “Anna” regardless of last name is slow: you have to read the whole book. That's the **leftmost-prefix rule** for composite indexes.",
    why: "Customer datasets grow to millions of rows. A query that takes 5 ms with the right index can take 20 seconds without it, and that is often the entire latency problem in an app or pipeline.",
    how: [
      "Create one: `CREATE INDEX idx_tickets_customer_created ON tickets (customer_id, created_at DESC);`",
      "The index above helps `WHERE customer_id = 7`, and `WHERE customer_id = 7 AND created_at > '2026-01-01'`, and `ORDER BY created_at` within a customer. It does **not** help `WHERE created_at > ...` alone.",
      "Run `EXPLAIN (ANALYZE, BUFFERS) <query>` to see the plan and real timings. **Seq Scan** means the whole table is read. **Index Scan / Index Only Scan** means the index was used.",
      "Other index types: **GIN** for `jsonb` keys, arrays and full-text search; **partial indexes** (`WHERE status = 'open'`) for hot subsets; **expression indexes** (`ON lower(email)`) when you query with a function; **HNSW** (pgvector) for embeddings."
    ],
    code: `
EXPLAIN ANALYZE SELECT * FROM tickets WHERE lower(email) = 'ana@example.com';
--  Seq Scan on tickets  (actual time=0.02..812.4 rows=1 loops=1)
--    Filter: (lower(email) = 'ana@example.com')
--    Rows Removed by Filter: 2999999          <- read 3M rows to find 1

CREATE INDEX idx_tickets_email_lower ON tickets (lower(email));

EXPLAIN ANALYZE SELECT * FROM tickets WHERE lower(email) = 'ana@example.com';
--  Index Scan using idx_tickets_email_lower on tickets  (actual time=0.03..0.04 rows=1)
`,
    pitfalls: [
      "Every index slows down writes and uses disk. Don't index every column.",
      "Wrapping an indexed column in a function (`WHERE date(created_at) = ...`) prevents use of a plain index on that column.",
      "Low-selectivity columns (such as a boolean that's true for 50% of rows) rarely benefit from an index."
    ] },

  { type: "concept", tag: "Concept 4", h: "Transactions, ACID and isolation",
    what: "A **transaction** groups statements so they succeed or fail together: `BEGIN; ...; COMMIT;` (or `ROLLBACK;`). **ACID** is the set of guarantees: **Atomicity** (all or nothing), **Consistency** (constraints always hold), **Isolation** (concurrent transactions don't see each other's half-done work), **Durability** (committed data survives a crash).\n\nPostgres uses **MVCC** (multi-version concurrency control): writers create new row versions, and readers see a consistent snapshot, so readers never block writers.",
    why: "Pipelines and apps write several related rows at once (an order and its lines; a document and its chunks). Without transactions, a crash halfway leaves half-written data that's hard to find and fix.",
    table: { cols: ["Isolation level", "What it prevents", "Typical use"], rows: [
      ["Read Committed (Postgres default)", "Reading uncommitted data", "Most OLTP work"],
      ["Repeatable Read", "A row changing between two reads in your transaction", "Reports needing a stable snapshot"],
      ["Serializable", "All anomalies; behaves as if transactions ran one at a time (may abort with a serialization error you must retry)", "Money, inventory, strict invariants"]
    ] },
    code: `
BEGIN;
  INSERT INTO documents (id, source, status) VALUES ('doc-1', 'sharepoint', 'indexed');
  INSERT INTO chunks (doc_id, n, text) VALUES ('doc-1', 0, '...'), ('doc-1', 1, '...');
COMMIT;   -- both inserts become visible together, or (on error / ROLLBACK) neither does

-- Lost-update protection for "read then write" logic:
SELECT balance FROM accounts WHERE id = 7 FOR UPDATE;   -- locks the row until COMMIT
UPDATE accounts SET balance = balance - 50 WHERE id = 7;
`,
    pitfalls: [
      "Long-running transactions (for example one open across an LLM call) hold locks and stop Postgres from cleaning up old row versions (vacuum). Keep transactions short.",
      "Read-modify-write in application code without `FOR UPDATE` or an atomic `UPDATE ... SET x = x - 1` loses updates under concurrency."
    ] },

  { type: "concept", tag: "Concept 5", h: "Data modeling: normalisation, star schemas, history",
    what: "**Data modeling** means deciding which tables exist, what columns they have and how they relate. **Normalisation** stores each fact once (customer address in the customers table, not repeated in every order). A **star schema**, used for analytics, has a central **fact table** of events (orders, tickets) with foreign keys to **dimension tables** describing them (customer, product, date). **SCD Type 2** (slowly changing dimension) keeps the history of changing attributes by adding a new row with validity dates instead of overwriting.",
    why: "A good model makes queries simple and correct; a bad one makes every question a 200-line query with subtle double counting. FDEs often design the model that the customer's data is loaded into.",
    example: "Denormalised (problematic): each order row repeats `customer_name`, `customer_tier`, `customer_address`. If the customer moves, you have to update 500 rows, and missing one makes the data disagree with itself.\n\nNormalised: `customers(id, name, tier, address)` and `orders(id, customer_id, total, created_at)`. The address lives in exactly one place.\n\nSCD Type 2 for “what tier was the customer when they ordered?”:",
    table: { cols: ["customer_id", "tier", "valid_from", "valid_to", "is_current"], rows: [
      ["42", "Silver", "2025-01-01", "2026-03-31", "false"],
      ["42", "Gold", "2026-04-01", "9999-12-31", "true"]
    ] },
    how: [
      "Start from the questions and access patterns: what will be asked, and how often?",
      "Normalise operational data (the app's own tables) to roughly 3rd normal form.",
      "Denormalise deliberately for read-heavy paths (search documents, analytics marts, feature tables).",
      "Use SCD2 when historical accuracy matters (pricing, tiers, org structure). Join facts on `order_date BETWEEN valid_from AND valid_to`."
    ],
    pitfalls: [
      "Joining a fact table to a dimension that has several rows per key (for example several SCD2 versions without the date condition) multiplies rows and inflates sums.",
      "Using free-text columns for categories. You get “Gold”, “gold ” and “GOLD”."
    ] },

  { type: "concept", tag: "Concept 6", h: "ETL vs ELT and pipeline layers",
    what: "**ETL** (extract → transform → load) cleans data in code before loading it. **ELT** (extract → load → transform) loads raw data first, then transforms it inside the database or warehouse with SQL (often using **dbt**). The modern default is ELT with layers: **raw** (exactly as received, never modified) → **staging** (cleaned and typed) → **core/marts** (business models).",
    why: "Keeping raw data untouched means that when you discover a cleaning bug in week 6, you fix the rule and re-run the transformations. You don't have to ask the customer to re-export everything. Layers also make it clear where a bad number came from.",
    how: [
      "**Extract:** pull from sources incrementally using a watermark (last `updated_at` seen), as in module 3.",
      "**Load raw:** append rows with metadata: `_source`, `_loaded_at`, `_file_name`, `_batch_id`.",
      "**Transform:** SQL or Python steps that are **idempotent** (running twice gives the same result, using upserts or delete-and-rebuild per batch).",
      "**Test:** row counts per layer, not-null and uniqueness checks, accepted values (dbt tests or Great Expectations).",
      "**Schedule and monitor:** an orchestrator (Airflow, Dagster, Prefect, Azure Data Factory, or cron to start with), with alerts on failures and on missing data."
    ],
    pitfalls: [
      "Overwriting raw data during cleaning.",
      "Non-idempotent loads (plain INSERT) that duplicate everything on re-run.",
      "No reconciliation: nobody can say whether 1,000,000 source rows became 1,000,000 or 987,000."
    ] },

  { type: "concept", tag: "Concept 7", h: "Cleaning messy customer data: a playbook",
    what: "Customer data is always messier than they say: duplicate records, inconsistent formats, free-text where there should be codes, broken encodings, missing values. Cleaning means turning it into consistent, validated data with a clear record of what was changed or rejected, and why.",
    why: "Garbage in, garbage out, and with LLMs the garbage comes out sounding confident. Many FDE projects are 60% data work. Doing it transparently (with quarantine and reconciliation) is also what makes the customer trust your numbers.",
    how: [
      "**Profile first.** For each column: row count, null %, distinct count, min/max, top 20 values. You'll find the problems before they find you.",
      "**Standardise formats:** trim whitespace, normalise case, Unicode-normalise text (NFKC), one date format (ISO 8601), phone numbers to E.164, currency amounts as numbers plus a separate currency code.",
      "**Map categories:** a mapping table from messy values to canonical codes (“GOLD”, “Gold ”, “gld” → `gold`), reviewed by the data owner.",
      "**Deduplicate:** first on a deterministic key (normalised email, tax ID), then fuzzy matching (name + address similarity) for the rest, with human review of borderline pairs.",
      "**Validate** every row against a schema (Pydantic, pandera, or SQL constraints).",
      "**Quarantine** failing rows with a reason instead of dropping them, and send a weekly report to the customer's data owner.",
      "**Reconcile:** count rows at every layer and explain every difference (“1,204,331 raw → 1,198,002 core + 6,329 quarantined”)."
    ],
    code: `
from datetime import date
from pydantic import BaseModel, EmailStr, Field, ValidationError, field_validator


class CustomerRow(BaseModel):
    email: EmailStr                               # requires pydantic[email]
    name: str = Field(min_length=1)
    country: str = Field(pattern=r"^[A-Z]{2}$")   # ISO 3166 alpha-2
    signup_date: date

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        return " ".join(v.split()).title()        # collapse spaces, title-case

    @field_validator("country", mode="before")
    @classmethod
    def upper_country(cls, v: str) -> str:
        return v.strip().upper()


good, quarantine = [], []
for raw in rows:                                  # rows: list[dict] from the staging layer
    try:
        good.append(CustomerRow.model_validate(raw))
    except ValidationError as e:
        quarantine.append({"row": raw, "reason": e.errors()[0]["msg"]})
print(f"{len(good)} valid, {len(quarantine)} quarantined")
`,
    table: { cols: ["Common problem", "Example", "Fix"], rows: [
      ["Ambiguous dates", "`03/04/2024`: March 4 (US) or April 3 (EU)?", "Explicit format per source, confirmed with the data owner; never guess"],
      ["Encoding damage", "`JosÃ©` instead of `José`", "Re-read the file as UTF-8 or the source's real encoding (often cp1252)"],
      ["Numbers as text", "`\"$1,204.50\"`, `\"1.204,50 €\"`", "Locale-aware parsing, separate amount and currency columns"],
      ["Duplicates", "Same customer with 3 emails", "Deterministic key, then fuzzy match + review"],
      ["Missing values", "Empty, `N/A`, `-`, `0` meaning unknown", "Normalise to NULL; decide per column whether NULL is allowed"]
    ] },
    pitfalls: [
      "Silently dropping bad rows.",
      "Guessing (date formats, units) instead of confirming with the data owner.",
      "Cleaning in a notebook that can't be re-run, so the next export has to be cleaned by hand again."
    ] },

  { type: "glossary", terms: [
    ["JOIN (inner/left)", "Combine rows from two tables by matching columns; LEFT keeps unmatched rows from the left side."],
    ["Anti-join", "Rows in one table with no match in another (`NOT EXISTS`)."],
    ["CTE", "A named sub-query (`WITH x AS (...)`) used to structure long queries."],
    ["Window function", "Per-row calculation over related rows without collapsing them (`ROW_NUMBER`, `LAG`, running `SUM`)."],
    ["B-tree index", "Sorted tree structure that makes lookups and range queries fast."],
    ["Leftmost prefix", "A composite index on (a, b) helps queries on a, or a and b, but not b alone."],
    ["EXPLAIN ANALYZE", "Postgres command showing the query plan and actual timings."],
    ["Transaction", "A group of statements that commit or roll back together."],
    ["ACID", "Atomicity, Consistency, Isolation, Durability."],
    ["MVCC", "Multi-version concurrency control: readers see a snapshot; writers create new row versions."],
    ["Normalisation", "Storing each fact once to avoid inconsistency."],
    ["Star schema", "Analytics model: fact table in the middle, dimension tables around it."],
    ["SCD Type 2", "Keeping history of changing attributes via rows with valid_from / valid_to."],
    ["ETL / ELT", "Transform before loading / load raw first and transform inside the database."],
    ["Idempotent load", "Re-running produces the same result, with no duplicates."],
    ["Quarantine table", "Where invalid rows go, with a reason, instead of being dropped."],
    ["Reconciliation", "Checking counts and totals match between source and each layer."],
    ["Data profiling", "Summary statistics per column to discover quality problems."]
  ] },

  { type: "walkthrough", h: "Real FDE scenario: “here's our product catalog” (14 Excel files)", tag: "Scenario", steps: [
    ["What arrives", "14 Excel files from 5 regions. Column names differ (`SKU`, `Item No`, `Article`), prices include currency symbols, dates are `03/04/2024` in some files and `2024-04-03` in others, and the same SKU appears with different descriptions in two regions."],
    ["Day 1: land and profile", "Load every file into `raw.catalog` unchanged, adding `_file_name` and `_loaded_at`. Run profiling: 212,440 rows, 3.1% null prices, 18,902 duplicate SKUs across regions, 7 distinct spellings of “in stock”."],
    ["Day 2: agree the rules", "One 30-minute call with the customer's catalog owner. Confirmed: US files use MM/DD, EU files DD/MM; the EU description wins on conflicts; prices are excluding VAT. You write these into a mapping config per source, so the rules live in code, not in someone's memory."],
    ["Days 3–4: staging and validation", "SQL transforms rename columns, parse dates per the config, split `\"€1.204,50\"` into amount 1204.50 and currency EUR, map stock statuses, and dedupe SKUs with `ROW_NUMBER()` (EU first, then latest `_loaded_at`). A Pydantic/SQL check sends 1,877 rows (missing SKU or price ≤ 0) to quarantine with reasons."],
    ["Day 5: reconcile and report", "Report to the customer: 212,440 raw → 191,661 unique products + 1,877 quarantined + 18,902 duplicates merged (with the rule applied). The customer fixes 1,500 quarantined rows at source. The pipeline is idempotent, so the next export runs unattended."]
  ] },

  { type: "list", h: "Hands-on task (60 minutes)", tag: "Task", ordered: true, items: [
    "Run Postgres in Docker: `docker run -e POSTGRES_PASSWORD=pw -p 5432:5432 postgres:16`.",
    "Create `staging.customers` and generate 100,000 rows with a Python script, deliberately including duplicate emails (different case and whitespace), bad emails, empty names and mixed date formats.",
    "Write the dedupe + upsert into `core.customers` using `ROW_NUMBER()` and `INSERT ... ON CONFLICT (email) DO UPDATE`, and insert failing rows into `quarantine.customers` with a `reason` column.",
    "Run it twice and prove the row counts don't change on the second run (idempotency).",
    "Add an index that makes `WHERE lower(email) = $1` fast, and paste the before/after `EXPLAIN ANALYZE` output into your notes."
  ] },

  { type: "list", h: "Practice questions", tag: "Practice", ordered: true, items: [
    "Write SQL returning each customer's latest ticket and the number of days since their previous ticket.",
    "A query `WHERE status = 'open' AND created_at > now() - interval '7 days'` is slow on 50 M rows. Which index would you create, and why that column order? When would a partial index be better?",
    "The customer wants to know what tier each customer was on the date of each order, but the customers table only holds the current tier. How do you model this going forward, and what can you do about the past?"
  ] },

  { type: "quiz", qs: [
    ["Composite index on `(tenant_id, created_at)`. Which query uses it best?", ["`WHERE created_at > X`", "`WHERE tenant_id = 7 AND created_at > X`", "`WHERE lower(tenant_id::text) = '7'`", "None of them"], 1, "Equality on the leftmost column, then a range on the next one: the ideal shape."],
    ["What's the difference between `GROUP BY` and a window function?", ["None", "GROUP BY collapses rows into one per group; window functions keep every row and add a computed column", "Window functions are slower always", "GROUP BY can't sum"], 1, "That's why ROW_NUMBER is perfect for dedup: you keep the rows and pick rn = 1."],
    ["After `LEFT JOIN orders o`, you add `WHERE o.status = 'paid'`. What happens?", ["Nothing changes", "Customers without orders disappear: it now behaves like an inner join", "Syntax error", "It returns only unpaid orders"], 1, "NULL o.status fails the WHERE. Put the condition in the ON clause."],
    ["Which Postgres index type is for keys inside a `jsonb` column?", ["B-tree", "GIN", "Hash", "BRIN"], 1, "GIN indexes the contents of jsonb, arrays and full-text vectors."],
    ["Why keep a raw layer that is never modified?", ["Faster queries", "You can re-run fixed transformations without asking the customer to re-export", "It's required by SQL", "To save storage"], 1, "Cleaning bugs are inevitable; raw data lets you recover."],
    ["Best default handling for 3% invalid rows?", ["Drop them silently", "Fail the whole pipeline", "Quarantine with a reason and report to the data owner", "Guess the values"], 2, "The pipeline keeps flowing and quality problems become visible and fixable."],
    ["SCD Type 2 is used to…", ["Speed up joins", "Keep the history of changing attributes with validity dates", "Remove duplicates", "Encrypt data"], 1, "It answers “what was true at the time?”."]
  ] },

  { type: "refs", items: [["PostgreSQL docs — Window functions tutorial", "https://www.postgresql.org/docs/current/tutorial-window.html"], ["PostgreSQL docs — Index types", "https://www.postgresql.org/docs/current/indexes-types.html"], ["Use The Index, Luke (free book with diagrams)", "https://use-the-index-luke.com/"], ["PostgreSQL docs — Transaction isolation", "https://www.postgresql.org/docs/current/transaction-iso.html"], ["dbt docs — What is dbt?", "https://docs.getdbt.com/docs/introduction"]] }
]);
