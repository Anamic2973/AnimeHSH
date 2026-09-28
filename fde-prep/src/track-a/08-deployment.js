__modA(8, "Deployment", "Getting your service running reliably in a customer's cloud: Docker images and containers, CI/CD pipelines, the Azure/AWS services you'll actually use, identity and secrets, enterprise networking, configuration, and logging.", [
  { type: "visual", h: "From commit to production", tag: "Visual", caption: "Build one immutable image per commit, test it, and promote the SAME image through staging to production. Secrets are fetched at runtime by the app's identity, never baked into the image.", mermaid: `
flowchart LR
  Dev["git push / pull request"] --> CI["CI<br/>lint, type-check,<br/>unit tests, evals"]
  CI --> B["docker build<br/>multi-stage, non-root"]
  B --> SC["Security scan<br/>dependencies + image"]
  SC --> REG[("Container registry<br/>ACR / ECR<br/>tag = git SHA")]
  REG --> STG["Deploy to staging<br/>smoke tests"]
  STG -->|"manual approval"| PRD["Deploy to production<br/>rolling / blue-green"]
  KV[("Key Vault /<br/>Secrets Manager")] -.->|"managed identity /<br/>IAM role"| STG
  KV -.-> PRD
  PRD --> OBS["Logs, metrics,<br/>traces, alerts"]
` },

  { type: "concept", tag: "Concept 1", h: "Containers and Docker",
    what: "A **container image** is a packaged, read-only snapshot of your app and everything it needs to run: OS libraries, the Python runtime, dependencies and your code. A **container** is a running instance of an image, isolated from other processes but sharing the host's kernel (lighter than a virtual machine). A **Dockerfile** is the recipe that builds the image, and each instruction creates a cached **layer**.",
    analogy: "The image is a sealed, labelled shipping container packed at the factory. The container is that box being used at the port. Any port with a crane (Docker, Kubernetes, Azure Container Apps, AWS ECS) can handle it the same way, whatever's inside.",
    why: "Containers remove “works on my machine”: the exact same image runs in CI, staging and the customer's production. Nearly every customer platform you deploy to runs containers.",
    how: [
      "**Build:** `docker build -t claims-extractor:dev .` reads the Dockerfile and produces an image.",
      "**Run locally:** `docker run -p 8000:8000 --env-file .env claims-extractor:dev`.",
      "**Layer caching:** Docker reuses a layer if its instruction and inputs didn't change. Copy dependency files and install dependencies **before** copying source code, so code changes don't reinstall everything.",
      "**Multi-stage builds:** one stage has build tools and compiles or installs; the final stage copies only the results, giving a smaller image with less attack surface.",
      "**Non-root user:** run the process as an unprivileged user, so a compromise can do less.",
      "**Health endpoint:** `/healthz` (process alive) and `/readyz` (dependencies reachable) let the platform restart or route around bad instances."
    ],
    code: `
# ---- build stage: install dependencies into a virtual environment ----
FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project     # cached until dependencies change
COPY src ./src
RUN uv sync --frozen --no-dev                          # installs your project itself

# ---- runtime stage: only what's needed to run ----
FROM python:3.12-slim
RUN useradd --create-home --uid 10001 app
WORKDIR /app
COPY --from=builder --chown=app:app /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER app                                               # never run as root
EXPOSE 8000
CMD ["uvicorn", "claims_extractor.main:app", "--host", "0.0.0.0", "--port", "8000"]
`,
    pitfalls: [
      "Copying the whole repo (including `.env`, `.git`, test data) into the image. Use a `.dockerignore`.",
      "Using the `latest` tag in production: you can't tell what's running or roll back reliably.",
      "Writing important data to the container's filesystem. Containers are disposable; use a database or object storage."
    ] },

  { type: "concept", tag: "Concept 2", h: "CI/CD pipelines",
    what: "**Continuous Integration (CI)** automatically builds and tests every change (usually every pull request) so problems are caught before merging. **Continuous Delivery/Deployment (CD)** automatically packages and deploys changes that pass, to staging and (after an approval gate, or automatically) to production.",
    why: "At a customer you need changes to be safe, repeatable and auditable. Security teams often require that production is only changed by a pipeline, never by someone's laptop. A good pipeline also makes rollback a 2-minute action instead of a crisis.",
    how: [
      "**On every pull request:** lint (`ruff`), type-check (`mypy`), unit tests, and eval smoke tests (module 6).",
      "**On merge to main:** build the image once and tag it with the **git commit SHA** (for example `claims-extractor:3f2a9c1`), so the tag says exactly which code is inside.",
      "**Scan** dependencies and the image for known vulnerabilities (CVEs).",
      "**Deploy to staging** and run smoke tests (a few real requests against the deployed service).",
      "**Promote the same image** to production after approval. Never rebuild for production.",
      "**Rollback** = redeploy the previous SHA tag."
    ],
    code: `
# .github/workflows/deploy.yml (trimmed; Azure example)
name: build-and-deploy
on:
  push:
    branches: [main]
permissions:
  id-token: write        # lets GitHub get a short-lived Azure token via OIDC: no stored cloud password
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync --frozen && uv run ruff check && uv run mypy src && uv run pytest -q
      - uses: azure/login@v2
        with:
          client-id: \${{ vars.AZURE_CLIENT_ID }}
          tenant-id: \${{ vars.AZURE_TENANT_ID }}
          subscription-id: \${{ vars.AZURE_SUBSCRIPTION_ID }}
      - run: |
          az acr login --name customeracr
          docker build -t customeracr.azurecr.io/claims-extractor:\${{ github.sha }} .
          docker push customeracr.azurecr.io/claims-extractor:\${{ github.sha }}
      - run: |
          az containerapp update -n claims-extractor-staging -g rg-claims \\
            --image customeracr.azurecr.io/claims-extractor:\${{ github.sha }}
`,
    table: { cols: ["Strategy", "How it works", "Trade-off"], rows: [
      ["Rolling", "Replace instances a few at a time", "Simple; old and new versions run side by side briefly"],
      ["Blue-green", "Deploy the new version alongside, then switch all traffic", "Instant rollback; needs double capacity during the switch"],
      ["Canary", "Send 5% of traffic to the new version, watch metrics, then increase", "Safest for risky changes; needs good metrics"]
    ] },
    pitfalls: [
      "Rebuilding the image for production from the same commit: it can pull different base-image or dependency versions.",
      "Long-lived cloud credentials stored as CI secrets. Use OIDC federation (short-lived tokens) where possible."
    ] },

  { type: "concept", tag: "Concept 3", h: "The cloud services you'll actually use (Azure and AWS)",
    what: "Most FDE deployments use the same handful of managed services. Knowing the equivalent names on each cloud lets you work in whatever the customer already uses.",
    table: { cols: ["Need", "Azure", "AWS", "What it's for"], rows: [
      ["Run containers (simple)", "Container Apps, App Service", "App Runner, ECS on Fargate", "Your API and workers without managing servers"],
      ["Run containers (Kubernetes)", "AKS", "EKS", "When the customer already runs Kubernetes"],
      ["Container registry", "ACR", "ECR", "Stores your images"],
      ["Secrets", "Key Vault", "Secrets Manager / SSM Parameter Store", "API keys, DB passwords, certificates"],
      ["App identity", "Managed identity (Entra ID)", "IAM role (task role)", "Lets the app access other services without stored credentials"],
      ["Postgres", "Azure Database for PostgreSQL", "RDS / Aurora PostgreSQL", "Managed relational DB (pgvector supported)"],
      ["Object storage", "Blob Storage", "S3", "Documents, exports, large files"],
      ["Queue", "Service Bus / Storage Queues", "SQS", "Background jobs, decoupling"],
      ["LLM endpoints", "Azure OpenAI / AI Foundry", "Bedrock", "Models inside the customer's cloud boundary"],
      ["Logs & metrics", "Azure Monitor / Log Analytics / App Insights", "CloudWatch", "Central logs, metrics, alerts"]
    ] },
    why: "Customers often mandate their cloud and even their region. Using the managed service they already operate and trust shortens security review and gives their operations team something familiar to support after you leave.",
    pitfalls: [
      "Choosing Kubernetes for a single small service. Managed container services are simpler to hand over.",
      "Assuming a model is available in the customer's required region. Check regional availability in week 1."
    ] },

  { type: "concept", tag: "Concept 4", h: "Identity for applications: managed identity and IAM roles",
    what: "A **managed identity** (Azure) or **IAM role** (AWS) is an identity given to your running app by the cloud platform. The platform supplies short-lived credentials to the app automatically. You grant that identity specific permissions (for example “read secret `llm-api-key` from this Key Vault”, “read from this storage container”).",
    why: "It removes the need to store any credentials in code, config or environment variables. There's nothing to leak or rotate by hand, and every access is audited against a named identity. Security reviewers strongly prefer it, and many enterprises require it.",
    how: [
      "Enable a managed identity on the Container App (or attach a task role to the ECS task).",
      "Grant it a narrowly scoped role, for example “Key Vault Secrets User” on one vault, “Storage Blob Data Reader” on one container.",
      "In code, use the SDK's default credential chain. It picks up the managed identity automatically in the cloud and your developer login locally.",
      "No secrets appear anywhere in your repository or deployment config."
    ],
    code: `
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

credential = DefaultAzureCredential()            # managed identity in Azure, "az login" locally
vault = SecretClient(vault_url="https://kv-claims-prod.vault.azure.net", credential=credential)
llm_key = vault.get_secret("llm-api-key").value  # fetched at startup; nothing stored in the image

# AWS equivalent: boto3 automatically uses the task's IAM role
# import boto3; boto3.client("secretsmanager").get_secret_value(SecretId="llm-api-key")
`,
    pitfalls: [
      "Granting broad roles (Contributor on the subscription) “to get it working” and never narrowing them.",
      "Fetching a secret on every request instead of caching it at startup with periodic refresh."
    ] },

  { type: "concept", tag: "Concept 5", h: "Secrets and configuration",
    what: "**Configuration** is everything that differs between environments (URLs, feature flags, model names, log level). **Secrets** are configuration that must stay confidential (API keys, passwords, signing keys). The Twelve-Factor App principle: keep config out of code, in the environment.",
    why: "Leaked secrets are one of the most common causes of breaches, and a secret committed to Git stays in its history forever. Clean configuration handling also lets the same image run in dev, staging and prod.",
    table: { cols: ["Approach", "Verdict"], rows: [
      ["Hard-coded in source", "Never"],
      ["In a committed `.env` or config file", "Never"],
      ["Baked into the Docker image", "Never, because anyone who can pull the image can read them"],
      ["Plain environment variables set in the platform", "Acceptable for non-sensitive config"],
      ["Secret store (Key Vault / Secrets Manager) read via managed identity", "Best practice for secrets"],
      ["Platform secret references (Container Apps secrets linked to Key Vault)", "Good: injected at runtime, rotated centrally"]
    ] },
    code: `
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")   # .env for local dev only
    environment: str = "dev"
    llm_model: str = "your-model-name"
    llm_timeout_s: float = 20
    database_url: str = Field(repr=False)          # from a secret reference in the cloud
    log_level: str = "INFO"


settings = Settings()        # fails fast at startup if a required value is missing
`,
    pitfalls: [
      "Logging the settings object at startup and printing secrets into logs.",
      "No rotation plan. Know how to rotate each secret without downtime."
    ] },

  { type: "concept", tag: "Concept 6", h: "Enterprise networking basics",
    what: "Enterprise cloud environments are usually private by default. A **VNet/VPC** is a private network in the cloud. **Private endpoints** give managed services (databases, Key Vault, storage, even Azure OpenAI) a private IP inside that network instead of a public internet address. **Egress** is outbound traffic from your app, often forced through a **firewall** or **proxy** that only allows approved destinations. **DNS** must resolve private endpoint names to private IPs.",
    why: "“The app can't reach the LLM” and “the app can't reach the database” are the most common deployment blockers in enterprise work, and they're networking problems, not code problems. Knowing the vocabulary lets you ask the customer's network team the right question on day 1.",
    how: [
      "List every outbound destination your app needs (LLM endpoint, identity provider, customer APIs, package registries during build).",
      "Request firewall/egress rules for them early, or use private endpoints and in-tenant model deployments.",
      "If traffic goes through an HTTPS-inspecting proxy, configure the proxy settings and the corporate **CA certificate** in your container, or TLS verification fails.",
      "Test connectivity from **inside** the deployed environment (a debug container running `curl`), not from your laptop."
    ],
    pitfalls: [
      "Disabling TLS verification to “fix” proxy errors. Install the corporate CA certificate instead.",
      "Forgetting that the build pipeline also needs network access (to package registries)."
    ] },

  { type: "concept", tag: "Concept 7", h: "Logging and observability for operations",
    what: "**Structured logs** are log lines emitted as JSON with consistent fields (timestamp, level, message, request_id, user_id, duration) rather than free text, so they can be searched and aggregated. A **correlation ID** (or trace ID) is a unique ID attached to a request and passed along to every service and log line it touches. **Metrics** are numeric time series (request rate, error rate, latency). **Alerts** fire when metrics break agreed thresholds (SLOs).",
    why: "When something fails in a customer environment you often can't attach a debugger or even SSH in. Logs, metrics and traces are your only eyes. Correlation IDs turn “find what happened to this user's request” from hours into a single query.",
    code: `
import json, logging, sys, time, uuid
from contextvars import ContextVar
from fastapi import FastAPI, Request

request_id: ContextVar[str] = ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({"ts": self.formatTime(record), "level": record.levelname,
                           "msg": record.getMessage(), "request_id": request_id.get(),
                           **getattr(record, "extra_fields", {})})


handler = logging.StreamHandler(sys.stdout)            # the platform collects stdout
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
log = logging.getLogger("app")
app = FastAPI()


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    rid = request.headers.get("x-request-id", str(uuid.uuid4()))
    request_id.set(rid)
    start = time.perf_counter()
    response = await call_next(request)
    log.info("request done", extra={"extra_fields": {"path": request.url.path,
             "status": response.status_code, "ms": round((time.perf_counter() - start) * 1000)}})
    response.headers["x-request-id"] = rid
    return response
`,
    how: [
      "Log to stdout; let the platform ship logs to Log Analytics / CloudWatch.",
      "Use levels properly: ERROR (needs attention), WARNING (unexpected but handled), INFO (key events), DEBUG (off in production).",
      "Never log secrets, tokens or raw PII.",
      "Alert on symptoms users feel (error rate, p95 latency against the SLO), not on every exception."
    ],
    pitfalls: [
      "Logging entire prompts and documents at INFO level. Expensive and a PII risk.",
      "Alert fatigue: dozens of noisy alerts that everyone learns to ignore."
    ] },

  { type: "glossary", terms: [
    ["Image / container", "Packaged app snapshot / a running instance of it."],
    ["Dockerfile", "Build recipe for an image; each instruction creates a cached layer."],
    ["Multi-stage build", "Using a build stage and a slim runtime stage to produce small images."],
    ["Registry", "Storage for images (ACR, ECR, GHCR)."],
    ["CI / CD", "Automated build-and-test on every change / automated deployment of passing builds."],
    ["Immutable tag", "Image tag that never changes meaning, such as the git SHA."],
    ["Rolling / blue-green / canary", "Deployment strategies: gradual replace / switch between two stacks / small % first."],
    ["Managed identity / IAM role", "Cloud-provided identity for an app, with short-lived automatic credentials."],
    ["OIDC federation (CI)", "CI gets short-lived cloud tokens without stored credentials."],
    ["Key Vault / Secrets Manager", "Managed secret stores."],
    ["Twelve-Factor App", "Principles for cloud apps, including config in the environment."],
    ["VNet / VPC", "Private network in the cloud."],
    ["Private endpoint", "Private IP for a managed service inside your network."],
    ["Egress", "Outbound network traffic from your app."],
    ["Structured logging", "Logs as JSON with consistent fields."],
    ["Correlation / trace ID", "ID that follows a request across services and log lines."],
    ["SLO", "Service level objective: target for reliability, such as 99.9% of requests under 2 s."]
  ] },

  { type: "walkthrough", h: "Real FDE scenario: deploying into a bank's locked-down Azure tenant", tag: "Scenario", steps: [
    ["Constraints (week 1)", "No public endpoints. All egress through a firewall. Images must come from the bank's own ACR after a Defender scan. Secrets only in their Key Vault. Production changes only through their pipeline with a change ticket."],
    ["Day 1 requests", "You send the platform team a single list: an ACR push identity for the pipeline, a resource group for staging and prod, a managed identity for the app with `Key Vault Secrets User` on one vault, a Postgres Flexible Server with a private endpoint, and egress rules for their Azure OpenAI private endpoint and Entra ID. Each request links to the architecture diagram."],
    ["Build pipeline", "GitHub Actions authenticates to Azure with OIDC federation (no stored secrets), builds the image once per commit, tags it with the SHA and pushes it to their ACR. Defender scans it; high-severity CVEs fail the pipeline."],
    ["First deploy fails", "The app starts, but LLM calls fail with TLS errors. Cause: the firewall inspects TLS with the bank's own CA. Fix: add their CA certificate to the image's trust store (not disabling verification) and set `HTTPS_PROXY`."],
    ["Go-live", "Staging smoke tests pass, and a change ticket is approved for the Tuesday window. Deploy = point the Container App at the tested SHA. Rollback = the previous SHA, documented in the runbook the bank's ops team signed off."]
  ] },

  { type: "list", h: "Hands-on task (90 minutes)", tag: "Task", ordered: true, items: [
    "Containerise your FastAPI service with the Dockerfile from Concept 1. Target: image under 250 MB, runs as non-root (`docker run ... whoami` should not print root).",
    "Add a `.dockerignore`, and `/healthz` and `/readyz` endpoints (`/readyz` checks the database connection).",
    "Write a GitHub Actions workflow: on pull request run ruff, mypy and pytest; on main build and tag the image with the git SHA.",
    "Replace any `.env`-only config with a `pydantic-settings` class that fails fast when a required value is missing.",
    "Add the JSON logging middleware from Concept 7 and confirm every log line for a request shares the same request_id."
  ] },

  { type: "list", h: "Practice questions", tag: "Practice", ordered: true, items: [
    "Why tag images with the git SHA instead of `latest`? Describe exactly how rollback works with SHA tags.",
    "Walk through, step by step, how a container on Azure Container Apps reads a Key Vault secret with no stored credential.",
    "A deploy succeeded, but the app returns 500 errors in production and works in staging. Describe your first 10 minutes of investigation."
  ] },

  { type: "quiz", qs: [
    ["Why copy `pyproject.toml` and the lock file before the source code in a Dockerfile?", ["Security", "So the dependency layer stays cached and only rebuilds when dependencies change", "Python requires it", "Smaller image"], 1, "Code changes often; dependencies rarely. Layer order decides what gets rebuilt."],
    ["What does a multi-stage build achieve?", ["Faster CPUs", "A smaller final image without build tools, so less attack surface", "Multiple apps in one image", "Automatic scaling"], 1, "The runtime stage copies only what's needed to run."],
    ["Best way for a cloud app to access its secrets?", ["Secrets in environment files in Git", "Managed identity / IAM role reading from Key Vault / Secrets Manager", "Baked into the image", "A shared admin password"], 1, "No stored credentials, scoped access, full audit trail."],
    ["How do you roll back with immutable SHA-tagged images?", ["Rebuild the old commit", "Redeploy the previous known-good SHA tag", "Edit files inside the running container", "Restore a VM snapshot"], 1, "The exact artefact that already ran successfully."],
    ["The app fails TLS verification behind a corporate proxy. Correct fix?", ["Disable TLS verification", "Install the corporate CA certificate and configure the proxy", "Use HTTP instead", "Switch cloud provider"], 1, "Disabling verification removes protection against interception."],
    ["What should propagate across every service and log line for a request?", ["The hostname", "A correlation / trace ID", "The user's password", "Only the timestamp"], 1, "It lets you reconstruct one request's full path."],
    ["Canary deployment means…", ["Deploying at night", "Sending a small percentage of traffic to the new version first and watching metrics", "Two full stacks with a switch", "Deploying without tests"], 1, "Blue-green is the two-stack switch."]
  ] },

  { type: "refs", items: [["Docker docs — Multi-stage builds", "https://docs.docker.com/build/building/multi-stage/"], ["uv docs — Using uv in Docker", "https://docs.astral.sh/uv/guides/integration/docker/"], ["Microsoft Learn — Managed identities overview", "https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview"], ["GitHub docs — OpenID Connect in Azure", "https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-azure"], ["The Twelve-Factor App", "https://12factor.net/"]] }
]);
