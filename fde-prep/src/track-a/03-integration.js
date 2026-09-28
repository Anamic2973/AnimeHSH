__modA(3, "Integration", "Connecting to customer systems: REST basics, authentication with OAuth2/OIDC and SSO, webhooks, pagination, retries, idempotency and rate limits, each explained with the exact mechanics.", [
  { type: "visual", h: "OAuth 2.0 Authorization Code flow with PKCE (and OIDC)", tag: "Visual", caption: "The login flow you will wire up for almost every enterprise customer. Every step is explained in Concept 3 below.", mermaid: `
sequenceDiagram
  participant U as User's browser
  participant A as Your app (backend)
  participant I as Customer IdP (Entra ID / Okta)
  participant R as Resource API
  U->>A: 1. Click "Sign in"
  A->>A: 2. Make code_verifier (random), code_challenge = SHA256(verifier), state, nonce
  A-->>U: 3. Redirect to IdP /authorize?client_id, redirect_uri, scope, state, code_challenge
  U->>I: 4. User logs in (password + MFA), consents
  I-->>U: 5. Redirect to redirect_uri?code=...&state=...
  U->>A: 6. Browser delivers code + state
  A->>A: 7. Check state matches
  A->>I: 8. POST /token with code + code_verifier
  I-->>A: 9. access_token, id_token, refresh_token
  A->>A: 10. Validate id_token (signature, iss, aud, exp, nonce)
  A->>R: 11. GET /data with Authorization: Bearer access_token
  R-->>A: 12. 200 OK + data
` },

  { type: "concept", tag: "Concept 1", h: "REST APIs: resources, methods and status codes",
    what: "A REST API exposes **resources** (things such as orders or tickets) at URLs, and you act on them with HTTP **methods**. The server answers with a **status code** saying what happened, plus usually a JSON body.",
    why: "Almost every integration you build as an FDE, whether reading the customer's CRM, writing to their ticketing system or exposing your own service, is HTTP + JSON. Reading status codes correctly decides whether you retry, fix your request or escalate.",
    table: { cols: ["Method", "Meaning", "Idempotent?", "Example"], rows: [
      ["GET", "Read", "Yes", "`GET /tickets/42`"],
      ["POST", "Create / perform an action", "**No** (unless you add an idempotency key)", "`POST /tickets`"],
      ["PUT", "Replace the whole resource", "Yes", "`PUT /tickets/42`"],
      ["PATCH", "Change some fields", "Not guaranteed", "`PATCH /tickets/42 {\"status\":\"closed\"}`"],
      ["DELETE", "Remove", "Yes", "`DELETE /tickets/42`"]
    ] },
    how: [
      "**2xx = success:** 200 OK, 201 Created, 202 Accepted (work queued, finished later), 204 No Content.",
      "**4xx = your request is wrong. Don't retry the same request:** 400 malformed, 401 not authenticated (missing or expired token), 403 authenticated but not allowed, 404 not found, 409 conflict (e.g. version mismatch), 422 validation failed, **429 too many requests (this one you retry, after waiting)**.",
      "**5xx = the server failed.** Often temporary: 500 internal error, 502/503/504 bad gateway, unavailable or timeout. These are usually safe to retry with backoff (if the operation is idempotent)."
    ],
    example: "“Idempotent” means doing it twice has the same effect as doing it once. Deleting ticket 42 twice leaves it deleted. POSTing “create ticket” twice creates two tickets. That's why retrying a POST is dangerous without an idempotency key (Concept 8).",
    pitfalls: [
      "Treating every non-200 as “retry”. Retrying a 400 or 422 only repeats the same failure.",
      "Confusing 401 (who are you? → refresh or get a token) with 403 (I know who you are, and you're not allowed → permissions problem)."
    ] },

  { type: "concept", tag: "Concept 2", h: "Authentication, authorisation, tokens and JWTs",
    what: "**Authentication (AuthN)** answers “who are you?”. **Authorisation (AuthZ)** answers “what are you allowed to do?”. Modern APIs use **tokens** instead of sending passwords on every request. An **access token** is a short-lived credential (typically 5–60 minutes) sent in the `Authorization: Bearer <token>` header. A **refresh token** is a longer-lived credential used only to get new access tokens. **Scopes** list what the token allows, for example `tickets.read`.\n\nMany tokens are **JWTs** (JSON Web Tokens): three base64url-encoded parts separated by dots, `header.payload.signature`. The payload holds **claims** (facts about the user and token). The signature proves the identity provider issued it and nobody changed it.",
    why: "Every enterprise integration involves tokens. If you validate them incorrectly (for example you don't check who the token was issued for), anyone with a token for a different app can call your API. This is a real, common vulnerability.",
    code: `
# A decoded JWT payload (the middle part), from Microsoft Entra ID:
{
  "iss": "https://login.microsoftonline.com/<tenant-id>/v2.0",   # issuer: who created it
  "aud": "api://claims-extractor",                               # audience: which API it is FOR
  "sub": "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ",           # subject: stable user id
  "exp": 1767225600,                                             # expiry (Unix seconds)
  "nbf": 1767222000,                                             # not valid before
  "scp": "claims.read claims.write",                             # scopes granted
  "roles": ["Adjuster"],                                         # app roles
  "oid": "7c3b...",                                              # object id of the user
}
`,
    how: [
      "Get the IdP's public signing keys from its **JWKS** endpoint (a URL listing public keys, found via `/.well-known/openid-configuration`). Cache them.",
      "Verify the token's **signature** with the key named in the header (`kid`). If the signature fails, reject.",
      "Check **`iss`** is the customer's tenant, **`aud`** is YOUR API, and **`exp`**/**`nbf`** are valid (allow ~60 s clock skew).",
      "Check **scopes/roles** for the specific operation (for example `claims.write` needed to POST).",
      "Only then trust `sub`/`oid` as the user's identity."
    ],
    pitfalls: [
      "Decoding the JWT without verifying the signature. Anyone can craft a JSON payload.",
      "Skipping the `aud` check. A token issued for another app in the same tenant would then work against your API.",
      "Storing access tokens in browser localStorage in SPAs, where any injected script can read them. Prefer a backend-for-frontend with HTTP-only cookies."
    ] },

  { type: "concept", tag: "Concept 3", h: "OAuth 2.0 flows: Authorization Code + PKCE and Client Credentials",
    what: "**OAuth 2.0** is the standard way for an app to get an access token to call an API on behalf of a user (delegated access) or on its own behalf. It defines “flows” (grant types). You need two of them.\n\n**Authorization Code + PKCE:** a user is present and logs in through the customer's identity provider (IdP). **Client Credentials:** no user; your backend service authenticates as itself (for example a nightly sync job).",
    how: [
      "(Steps match the numbers in the diagram above.) **1–2:** Your app generates a random `code_verifier` and derives `code_challenge = SHA256(code_verifier)`. It also generates a random `state` (to prevent CSRF, cross-site request forgery) and a `nonce` (to prevent token replay).",
      "**3:** It redirects the browser to the IdP's `/authorize` URL with `client_id`, `redirect_uri`, `scope` (e.g. `openid profile api://claims/claims.read`), `state` and `code_challenge`.",
      "**4:** The user logs in at the IdP (with MFA if required). Your app never sees the password.",
      "**5–6:** The IdP redirects back to your `redirect_uri` with a one-time `code` and the same `state`.",
      "**7:** Your app checks `state` matches what it sent. If not, reject: someone may be injecting a login.",
      "**8–9:** Your backend exchanges `code` + `code_verifier` at the IdP's `/token` endpoint. The IdP hashes the verifier and compares it with the challenge from step 3. This is **PKCE**: even if an attacker stole the code in transit, they can't redeem it without the verifier. The IdP returns `access_token`, `id_token`, `refresh_token`.",
      "**10–12:** Validate the ID token, create the user's session, and call APIs with the access token.",
      "**Client Credentials:** your service POSTs `client_id` + a secret or certificate to `/token` with `grant_type=client_credentials` and gets an access token directly. Use a certificate or managed identity rather than a secret where possible."
    ],
    code: `
# Client credentials with MSAL (Microsoft's library) — service-to-service, no user
import msal

app = msal.ConfidentialClientApplication(
    client_id="<app-registration-client-id>",
    authority="https://login.microsoftonline.com/<tenant-id>",
    client_credential="<secret-from-key-vault>",
)
result = app.acquire_token_for_client(scopes=["api://crm-api/.default"])
token = result["access_token"]          # MSAL caches it and reuses it until near expiry
`,
    pitfalls: [
      "Using the old Implicit flow or the Resource Owner Password flow in new work. Both are deprecated for security reasons.",
      "Using Client Credentials when you actually need to act as the user. You lose the user's own permission boundaries.",
      "Hard-coding client secrets in code or config files."
    ] },

  { type: "concept", tag: "Concept 4", h: "OIDC and enterprise SSO",
    what: "**OpenID Connect (OIDC)** is a thin identity layer on top of OAuth 2.0. OAuth alone gives you an access token for an API; OIDC adds an **ID token**, a JWT that tells *your app* who the user is (name, email, user ID). **Single Sign-On (SSO)** means employees log in once with their company account (Microsoft Entra ID, Okta, Google Workspace) and get into many apps without new passwords. SSO is implemented with OIDC or with the older XML-based **SAML** protocol.",
    why: "Enterprise customers will require your app to use their SSO. It gives them central control (disable one account and access is removed everywhere), MFA, and audit. “Sign in with your company account” is often a hard requirement to pass security review.",
    how: [
      "The customer's admin (or you, with their approval) creates an **app registration** in their IdP. It gets a `client_id`, allowed `redirect_uri`s and, if needed, a certificate or secret.",
      "You configure which **claims** the tokens include, for example email and **group memberships** or **app roles**.",
      "Your app uses the Authorization Code + PKCE flow (Concept 3) with the `openid` scope to receive an ID token.",
      "You map IdP groups or roles to your app's permissions, for example group `Claims-Adjusters` → role `adjuster`.",
      "For API calls, your API validates the **access token** (not the ID token)."
    ],
    table: { cols: ["", "ID token", "Access token"], rows: [
      ["Purpose", "Tells your app who logged in", "Lets the holder call an API"],
      ["Audience (`aud`)", "Your app's client ID", "The API being called"],
      ["Who reads it", "Your app (the client)", "The resource API"],
      ["Send to APIs?", "No", "Yes, as the Bearer token"]
    ] },
    pitfalls: [
      "Sending the ID token to your API as if it were an access token.",
      "Group overage: in Entra ID, users in many groups (over 200) get a link instead of the group list, so you must call Microsoft Graph to fetch them.",
      "Forgetting that people leave: sessions should be short, or re-check access regularly."
    ] },

  { type: "concept", tag: "Concept 5", h: "Webhooks: receiving events safely",
    what: "A webhook is an HTTP request that **another system sends to you** when something happens, for example “ticket created” or “payment succeeded”. Instead of you polling their API every minute, they call your URL. It's sometimes called a “reverse API”.",
    why: "Webhooks give near-real-time integrations without wasteful polling. But your endpoint is public on the internet, providers retry failed deliveries, and events can arrive twice or out of order. A naive handler creates duplicate records or accepts forged events.",
    how: [
      "**Verify the signature.** The provider signs each request with a shared secret, usually HMAC-SHA256 over the raw body plus a timestamp, and sends it in a header. Recompute the HMAC with your copy of the secret and compare in constant time. A mismatch means it's forged, so reject with 401.",
      "**Reject old timestamps** (for example older than 5 minutes) so an attacker can't replay a captured request.",
      "**Respond fast (2xx within about 1–2 seconds).** Put the event on a queue and process it asynchronously. Slow responses cause the provider to time out and retry, which makes duplicates.",
      "**Deduplicate by event ID.** Providers guarantee *at-least-once* delivery, so the same event can arrive several times. Store processed IDs (unique constraint) and skip repeats.",
      "**Handle ordering.** “updated” can arrive before “created”. Compare version numbers or timestamps, or re-fetch the current state from the API."
    ],
    code: `
import hashlib, hmac, time
from fastapi import FastAPI, Header, HTTPException, Request

app = FastAPI()
SECRET = b"from-key-vault"


def valid_signature(raw: bytes, sig: str, ts: str) -> bool:
    if abs(time.time() - int(ts)) > 300:                        # older than 5 min: replay?
        return False
    expected = hmac.new(SECRET, ts.encode() + b"." + raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)                   # constant-time comparison


@app.post("/webhooks/tickets", status_code=202)
async def ticket_webhook(request: Request,
                         x_signature: str = Header(), x_timestamp: str = Header()):
    raw = await request.body()                                  # RAW bytes, not re-serialised JSON
    if not valid_signature(raw, x_signature, x_timestamp):
        raise HTTPException(401, "bad signature")
    event = await request.json()
    inserted = await db_insert_if_new(event["id"])              # UNIQUE(event_id) in the database
    if inserted:
        await queue.enqueue("process_ticket_event", event)      # heavy work happens elsewhere
    return {"received": True}
`,
    pitfalls: [
      "Verifying the signature against re-serialised JSON. Whitespace and key order change, and the HMAC no longer matches.",
      "Doing the real work (LLM calls) inside the webhook request.",
      "Using `==` to compare signatures, which leaks timing information. Use `hmac.compare_digest`."
    ] },

  { type: "concept", tag: "Concept 6", h: "Pagination: offset vs cursor",
    what: "APIs return large lists in **pages**. With **offset pagination** you ask for `?offset=200&limit=100` (skip 200, give me 100). With **cursor (keyset) pagination** the API returns a `next_cursor` token pointing just after the last item, and you pass it back: `?cursor=eyJpZCI6MTIzfQ`.",
    why: "When you sync a customer's data (all tickets, all documents), pagination bugs silently lose or duplicate records, and nobody notices until numbers don't reconcile.",
    how: [
      "**Why offset breaks:** you read page 1 (items 1–100). Before you read page 2, someone deletes item 5. Everything shifts left by one, so item 101 becomes item 100 and you **never see it**. Insertions cause duplicates in the same way.",
      "**Offset is also slow deep in the list:** the database has to scan and discard all the skipped rows.",
      "**Cursor pagination fixes both:** the cursor encodes the last item's sort key, such as `(updated_at, id)`. The next query is `WHERE (updated_at, id) > (last_updated_at, last_id) ORDER BY updated_at, id LIMIT 100`, which uses an index and is unaffected by changes to earlier rows.",
      "**For incremental sync:** store a **watermark** (the highest `updated_at` you processed). Next run, fetch only records changed since then."
    ],
    code: `
async def fetch_all_tickets(client, since: str | None):
    params = {"limit": 100, "updated_since": since} if since else {"limit": 100}
    while True:
        r = await request_with_retry(client, "GET", "/api/tickets", params=params)  # Concept 7
        page = r.json()
        for ticket in page["items"]:
            yield ticket
        if not page.get("next_cursor"):
            break                                     # no more pages
        params = {"limit": 100, "cursor": page["next_cursor"]}
`,
    pitfalls: [
      "Stopping when a page has fewer than `limit` items. Some APIs return short pages mid-stream; always use the cursor or has-more flag.",
      "Forgetting deletions: incremental sync on `updated_at` never sees deleted records. Use the provider's deleted-items endpoint or change events."
    ] },

  { type: "concept", tag: "Concept 7", h: "Retries with exponential backoff and jitter",
    what: "A **retry** repeats a failed request. **Exponential backoff** waits longer after each failure (for example 0.5 s, 1 s, 2 s, 4 s). **Jitter** randomises each wait so that many clients don't retry at the same instant.",
    why: "Networks and services fail briefly all the time: a pod restarts, a gateway times out, you hit a rate limit. Without retries your integration breaks on every blip. With naive retries (instant, forever, on every error) you make outages worse by hammering a struggling service. That's called a **retry storm**.",
    how: [
      "**Retry only transient errors:** connection errors, timeouts, 429, 502, 503, 504. Never 400/401/403/404/422, because the same request will fail again.",
      "**Only retry operations that are safe to repeat** (GET, PUT, DELETE, or POST with an idempotency key).",
      "**Wait with backoff:** `delay = random.uniform(0, min(cap, base × 2^attempt))`. This is “full jitter”. With base 0.5 s the maximum waits are 1 s, 2 s, 4 s, 8 s…",
      "**Honour `Retry-After`:** if the server says “wait 30 seconds”, wait 30 seconds.",
      "**Cap attempts** (for example 5) and total time. Then fail loudly: log, alert, or send to a dead-letter queue."
    ],
    code: `
import asyncio, random
import httpx

RETRYABLE_STATUS = {429, 502, 503, 504}


async def request_with_retry(client: httpx.AsyncClient, method: str, url: str,
                             max_attempts: int = 5, base: float = 0.5, cap: float = 20.0, **kw):
    for attempt in range(1, max_attempts + 1):
        retry_after = None
        try:
            resp = await client.request(method, url, **kw)
            if resp.status_code not in RETRYABLE_STATUS:
                return resp                            # success or a non-retryable error
            retry_after = resp.headers.get("Retry-After")
        except (httpx.ConnectError, httpx.ReadTimeout):
            pass                                       # transient network problem
        if attempt == max_attempts:
            raise RuntimeError(f"{method} {url} failed after {attempt} attempts")
        if retry_after and retry_after.isdigit():
            delay = float(retry_after)                 # server told us how long
        else:
            delay = random.uniform(0, min(cap, base * 2 ** attempt))   # full jitter
        await asyncio.sleep(delay)
`,
    pitfalls: [
      "Retrying at every layer (client, SDK, gateway, service), so one failure turns into 5 × 5 × 5 = 125 calls.",
      "No jitter: 1,000 clients that failed together all retry at exactly 1 s, 2 s, 4 s and knock the service over again."
    ] },

  { type: "concept", tag: "Concept 8", h: "Idempotency and idempotency keys",
    what: "An operation is **idempotent** if repeating it has the same effect as doing it once. An **idempotency key** is a unique ID the client sends with a non-idempotent request (usually a POST) so the server can recognise a repeat and return the original result instead of doing the work again.",
    why: "Retries (Concept 7) and at-least-once webhooks (Concept 5) mean the same request WILL arrive twice. Without idempotency: two refunds, two tickets, two emails to the customer's customer. This is one of the most common integration bugs.",
    how: [
      "The client generates a unique key per logical operation, for example a UUID, or better a deterministic one like `refund-{order_id}-{attempt_group}`, and sends it as `Idempotency-Key: ...`.",
      "The server looks up the key. **Not seen:** it stores the key with status “in progress”, does the work, then stores the result against the key.",
      "**Seen and finished:** it returns the stored result without doing the work again.",
      "**Seen and still in progress:** it returns 409, and the client retries later.",
      "Keys expire after a sensible window (for example 24 hours)."
    ],
    example: "Timeline without a key: POST /refunds → the refund is created → the response is lost to a network timeout → the client retries → **a second refund is created**. With a key: the retry carries the same key → the server finds the stored result → it returns the first refund → **exactly one refund**.",
    pitfalls: [
      "Generating a new key on each retry. Then it's useless.",
      "Storing the key in a different transaction from the work, so a crash between them leaves them inconsistent. Do both in one DB transaction where possible."
    ] },

  { type: "concept", tag: "Concept 9", h: "Rate limits",
    what: "APIs cap how many requests (or, for LLM APIs, how many tokens) you may send per time window, for example 100 requests per minute per client. When you exceed the limit, they return **429 Too Many Requests**, often with a `Retry-After` header and headers such as `X-RateLimit-Remaining`.",
    why: "Bulk jobs such as a backfill of 2 million records or summarising 50,000 documents will hit limits. If you ignore them, the job fails halfway, or the customer's API gets overloaded and their admins block your integration.",
    how: [
      "Read the provider's documentation for limits per endpoint, per user, per app and per tenant.",
      "**Throttle on the client side** so you never exceed the limit. A token bucket works well: tokens refill at the allowed rate and each request spends one.",
      "Watch the `X-RateLimit-Remaining` headers and slow down before hitting zero.",
      "For big jobs, use a queue with a fixed number of workers and a known rate, and make the job **resumable** (checkpoint the cursor) so a failure doesn't restart from zero.",
      "For LLM APIs, budget **tokens per minute** as well as requests per minute."
    ],
    pitfalls: [
      "Running a large backfill during the customer's business hours and starving their own users of API capacity.",
      "Parallelising across many workers and forgetting that the rate limit is shared by all of them."
    ] },

  { type: "glossary", terms: [
    ["REST", "Style of HTTP API built around resources at URLs and standard methods (GET, POST, PUT, PATCH, DELETE)."],
    ["Idempotent", "Repeating the operation has the same effect as doing it once."],
    ["AuthN / AuthZ", "Authentication (who you are) / authorisation (what you may do)."],
    ["Access token", "Short-lived credential sent as `Authorization: Bearer ...` to call an API."],
    ["Refresh token", "Longer-lived credential used only to obtain new access tokens."],
    ["Scope", "A named permission in a token, such as `tickets.read`."],
    ["JWT", "JSON Web Token: header.payload.signature; signed claims about a user or app."],
    ["Claim", "A field inside a token (iss, aud, sub, exp, roles…)."],
    ["JWKS", "The URL where an identity provider publishes public keys to verify token signatures."],
    ["IdP", "Identity provider, such as Microsoft Entra ID, Okta or Google."],
    ["OAuth 2.0", "Standard for obtaining access tokens (delegated authorisation)."],
    ["PKCE", "Proof Key for Code Exchange: stops a stolen authorization code from being redeemed."],
    ["OIDC", "OpenID Connect: identity layer on OAuth 2.0 that adds the ID token."],
    ["SSO", "Single sign-on: one company login for many apps."],
    ["SAML", "Older XML-based SSO protocol, still common in enterprises."],
    ["Webhook", "An HTTP call another system makes to your endpoint when an event happens."],
    ["HMAC", "A keyed hash used to sign messages so the receiver can verify origin and integrity."],
    ["At-least-once delivery", "Every event is delivered, but possibly more than once."],
    ["Cursor pagination", "Paging with a token that marks the position after the last item returned."],
    ["Watermark", "The last processed timestamp or ID, used to fetch only newer changes next time."],
    ["Exponential backoff", "Waiting progressively longer between retries."],
    ["Jitter", "Randomness added to retry waits to spread clients out."],
    ["Idempotency key", "Client-provided unique ID letting the server deduplicate repeated requests."],
    ["429", "HTTP status “Too Many Requests”: you hit a rate limit."]
  ] },

  { type: "walkthrough", h: "Real FDE scenario: syncing Salesforce cases into your platform", tag: "Scenario", steps: [
    ["The ask", "“Sync our Salesforce support cases into your AI triage system every 5 minutes. Users should log in with our Entra ID.”"],
    ["Authentication", "The integration runs without a user, so it uses **Client Credentials** (Salesforce supports the OAuth client credentials flow for connected apps) with a dedicated integration user that has read-only access to cases. The secret goes in Key Vault. For the web app, you register an app in Entra ID, use Authorization Code + PKCE, and map the Entra group `Support-Leads` to your admin role."],
    ["Initial load", "4 million historical cases. You paginate with the Bulk API or a cursor on `(SystemModstamp, Id)`, checkpoint after every page so the load can resume, and run it overnight to stay within the org's daily API limits."],
    ["Incremental sync", "Every 5 minutes: fetch cases with `SystemModstamp > watermark`, upsert by Salesforce `Id` (idempotent, so re-processing a case is harmless), then advance the watermark only after the batch commits."],
    ["Deletes and near-real-time", "Deleted cases don't show up in the modstamp query, so you poll the deleted-records endpoint (or subscribe to Change Data Capture events, which are delivered at least once, so you dedupe by event ID)."],
    ["Failure handling", "Transient errors are retried with jittered backoff. On 401 you refresh the token once. On repeated 5xx the job alerts and resumes from the watermark next run, so no data is lost."]
  ] },

  { type: "list", h: "Hands-on task (60 minutes)", tag: "Task", ordered: true, items: [
    "Write the webhook endpoint from Concept 5 with a SQLite or Postgres table `processed_events(event_id PRIMARY KEY)`.",
    "Write a test that sends the same signed event twice and asserts it is processed once, and one that sends a bad signature and expects 401.",
    "Write a cursor-paginating client (Concept 6) against a small fake API you build with FastAPI that returns 3 pages.",
    "Make the fake API return `429` with `Retry-After: 1` on the first call, and verify `request_with_retry` waits and then succeeds.",
    "Decode a real JWT from your own platform at jwt.io (never paste production tokens into websites; use a test tenant) and name every claim."
  ] },

  { type: "list", h: "Practice questions", tag: "Practice", ordered: true, items: [
    "Explain the difference between an ID token and an access token, and which one your API must accept. What goes wrong if it accepts the other?",
    "A payment provider's webhook is sometimes delivered twice and sometimes out of order. Design the handler step by step.",
    "Why is offset pagination dangerous when syncing a table that is actively being modified? Give a concrete example with row numbers."
  ] },

  { type: "quiz", qs: [
    ["Which HTTP response should NOT be retried automatically?", ["503 Service Unavailable", "429 Too Many Requests", "422 Unprocessable Entity", "Connection timeout"], 2, "422 means the request itself is invalid; sending it again gives the same answer."],
    ["What does the `aud` claim check protect against?", ["Expired tokens", "Tokens issued for a different API being accepted by yours", "Wrong passwords", "Replay of webhooks"], 1, "Audience = who the token is for. Always check that it's your API."],
    ["What problem does PKCE solve?", ["Slow logins", "A stolen authorization code being exchanged for tokens by an attacker", "Password storage", "Rate limiting"], 1, "Without the code_verifier, a stolen code is useless."],
    ["Which OAuth flow fits a nightly sync job with no user present?", ["Authorization Code + PKCE", "Client Credentials", "Implicit", "Password"], 1, "No user → the service authenticates as itself."],
    ["Webhook providers usually guarantee…", ["Exactly-once, in-order delivery", "At-least-once delivery, order not guaranteed", "At-most-once delivery", "Delivery within 100 ms"], 1, "So dedupe by event ID and handle reordering."],
    ["Why add jitter to backoff?", ["HTTP requires it", "So many clients don't retry at the same moment and overload the service again", "To make tests flaky", "To reduce log volume"], 1, "It spreads retries out in time."],
    ["A client retries POST /refunds after a timeout. What prevents a double refund?", ["A longer timeout", "An idempotency key the server uses to return the original result", "Using PUT instead", "Nothing can"], 1, "The server recognises the repeat and replays the stored result."],
    ["You sync with offset pagination and a row on page 1 is deleted mid-sync. What happens?", ["Nothing", "One row shifts into page 1 and is skipped", "The API errors", "You get a duplicate of the deleted row"], 1, "Everything shifts left by one; the first row of the next page is never read."]
  ] },

  { type: "refs", items: [["Microsoft identity platform — Authorization code flow (with diagram)", "https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow"], ["RFC 7636 — PKCE", "https://datatracker.ietf.org/doc/html/rfc7636"], ["jwt.io — JWT introduction", "https://jwt.io/introduction"], ["AWS Architecture Blog — Exponential backoff and jitter", "https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/"], ["Stripe docs — Idempotent requests", "https://docs.stripe.com/api/idempotent_requests"], ["Stripe docs — Webhook signature verification", "https://docs.stripe.com/webhooks#verify-events"]] }
]);
