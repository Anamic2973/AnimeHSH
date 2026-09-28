__modA(2, "Production Python", "The Python you ship to customers: type hints, how async really works, packaging, FastAPI, and testing, each explained from first principles with runnable examples.", [
  { type: "visual", h: "What happens when a request hits an async FastAPI service", tag: "Visual", caption: "One worker process runs one event loop that juggles many requests. While one request waits on the database or an LLM, the loop serves others. Anything that blocks the loop (sync I/O or heavy CPU work) freezes every request on that worker.", mermaid: `
flowchart LR
  C[Client] --> U["Uvicorn worker<br/>(one event loop)"]
  U --> M["Middleware<br/>auth, request-id, timing"]
  M --> V["Pydantic validates<br/>the JSON body"]
  V --> D["Depends() builds<br/>db session, user, settings"]
  D --> H["async def handler"]
  H -->|"await (loop is free meanwhile)"| IO1[("Postgres")]
  H -->|"await gather (in parallel)"| IO2["LLM API"]
  H --> R["Response model<br/>serialised to JSON"]
  R --> C
  H -.->|"CPU-heavy or sync library"| P["thread pool / process pool / queue"]
` },

  { type: "concept", tag: "Concept 1", h: "Type hints and static type checking",
    what: "Type hints are annotations that say what type a variable, parameter or return value should be, for example `def total(prices: list[float]) -> float`. Python itself **ignores them at runtime**. A separate tool (a type checker such as `mypy` or `pyright`) reads your code without running it and reports mismatches.",
    why: "In a customer codebase, other people (and you, six months later) must understand and change your code safely. Type hints document intent, let the IDE autocomplete, and catch whole classes of bugs before deployment, like passing `None` where a string is required. In interviews, typed code signals production experience.",
    how: [
      "Annotate function parameters and return types: `def get_user(user_id: int) -> User | None:`.",
      "Use built-in generics: `list[str]`, `dict[str, int]`, `tuple[int, int]`.",
      "Use `X | None` (older style: `Optional[X]`) when a value can be missing. The checker then forces you to handle `None`.",
      "Use `TypedDict` to describe the shape of a plain dict, and `Protocol` to describe “anything with these methods” (duck typing).",
      "Run `mypy --strict src/` or `pyright` in CI so type errors fail the build."
    ],
    code: `
from typing import Protocol, TypedDict


class Invoice(TypedDict):            # describes a dict's keys and value types
    number: str
    total: float


class Summariser(Protocol):          # any class with this method "fits", no inheritance needed
    def summarise(self, text: str) -> str: ...


def find_invoice(invoices: list[Invoice], number: str) -> Invoice | None:
    for inv in invoices:
        if inv["number"] == number:
            return inv
    return None


inv = find_invoice([], "INV-1")
print(inv["total"])                  # mypy: error — "inv" might be None. Handle it first:
if inv is not None:
    print(inv["total"])              # OK
`,
    example: "Type hints vs Pydantic: type hints are checked **before** running (static). Pydantic models are checked **while** running (runtime): they validate incoming JSON and raise an error if a field is missing or has the wrong type. Use type hints everywhere, and Pydantic at the edges where untrusted data enters (API requests, LLM outputs, config files).",
    pitfalls: [
      "Coming from C#: hints are not enforced. `def f(x: int)` will happily accept `\"hello\"` at runtime unless a checker or Pydantic catches it.",
      "Using `Any` everywhere switches checking off. Use it only at genuinely untyped boundaries.",
      "Writing hints but never running a checker in CI, so they slowly become wrong."
    ] },

  { type: "concept", tag: "Concept 2", h: "How async/await actually works",
    what: "`async`/`await` lets one thread handle many tasks that spend most of their time **waiting** (for the network, a database, an LLM API). A function defined with `async def` is a **coroutine**: calling it returns an object that can be paused and resumed. `await` means “pause me here until this finishes, and let the **event loop** run other coroutines meanwhile”.\n\nThe **event loop** is a scheduler running in a single thread. It keeps a list of coroutines that are ready to continue and runs them one at a time, each until its next `await`.",
    analogy: "One waiter (the event loop) serves 20 tables. After taking an order they don't stand at the kitchen waiting for the food. They go and take other orders, and come back when the kitchen rings the bell (the I/O completes). One waiter can serve many tables because most of the time is spent waiting on the kitchen, not walking.",
    why: "LLM applications are mostly waiting: an LLM call takes 1–10 seconds, a vector search 50 ms, a database query 5 ms. With synchronous code, each worker handles one request at a time, so waiting time is wasted. With async, one worker can have hundreds of requests in flight. You also need async to call several things at once, such as 5 retrievers in parallel instead of one after another.",
    how: [
      "Your handler calls `await client.get(url)`. The HTTP library sends the request and tells the loop: “wake me when the response arrives”.",
      "The coroutine pauses. The loop picks the next ready coroutine (maybe another user's request) and runs it until that one hits an `await`.",
      "When the operating system reports that the response bytes arrived, the loop marks the first coroutine as ready.",
      "On its next turn, the loop resumes the first coroutine exactly where it paused, with the response as the result of `await`.",
      "**Concurrency ≠ parallelism:** only one coroutine runs Python code at any instant. Async speeds up waiting, not computing."
    ],
    code: `
import asyncio, time


async def call_llm(name: str) -> str:
    await asyncio.sleep(1)          # stands in for a 1-second network call
    return f"{name} done"


async def sequential() -> None:
    start = time.perf_counter()
    for n in ["a", "b", "c"]:
        await call_llm(n)           # waits for each before starting the next
    print(f"sequential: {time.perf_counter() - start:.1f}s")   # ~3.0s


async def concurrent() -> None:
    start = time.perf_counter()
    results = await asyncio.gather(call_llm("a"), call_llm("b"), call_llm("c"))
    print(results, f"concurrent: {time.perf_counter() - start:.1f}s")  # ~1.0s


asyncio.run(sequential())
asyncio.run(concurrent())
`,
    pitfalls: [
      "Calling an `async def` without `await` just creates a coroutine object; nothing runs. Python warns: “coroutine was never awaited”.",
      "C# difference: .NET `Task`s run on a thread pool and can be truly parallel. Python coroutines all share one thread, so CPU-heavy code blocks everything.",
      "Async does not make CPU work (parsing a 500-page PDF, running a local model) faster. Use processes or a job queue for that."
    ] },

  { type: "concept", tag: "Concept 3", h: "Blocking the event loop (the #1 async bug)",
    what: "“Blocking the loop” means running code inside an `async def` that doesn't `await` but still takes a long time, for example `time.sleep(2)`, `requests.get(...)`, a synchronous database driver, or heavy CPU work. While that code runs, the event loop is stuck and cannot switch to any other request.",
    why: "It turns your concurrent server into a sequential one without any error message. Under load, latency explodes: if one request blocks for 2 seconds, the 20 requests queued behind it each wait 2 more seconds. This is one of the most common production incidents in FastAPI services.",
    how: [
      "**Detect it:** p95 latency jumps sharply when several users arrive together, while CPU sits low. Enable asyncio debug mode (`PYTHONASYNCIODEBUG=1`) to log callbacks that took longer than 100 ms.",
      "**Fix 1: use an async library:** `httpx.AsyncClient` instead of `requests`, `asyncpg` or async SQLAlchemy instead of `psycopg2`, the provider's async SDK client.",
      "**Fix 2: move sync code to a thread:** `await asyncio.to_thread(sync_function, arg)` runs it in a worker thread while the loop stays free.",
      "**Fix 3: declare the route with plain `def`:** FastAPI automatically runs `def` routes in a thread pool (about 40 threads by default).",
      "**Fix 4: CPU-heavy work:** send it to a process pool or a background job queue (Celery, RQ, Arq, a cloud queue) and return a job ID."
    ],
    code: `
import asyncio
import requests                      # synchronous HTTP library
from fastapi import FastAPI

app = FastAPI()


@app.get("/bad")
async def bad():
    r = requests.get("https://example.com")     # BLOCKS the loop for the whole call
    return {"status": r.status_code}


@app.get("/fixed-thread")
async def fixed_thread():
    r = await asyncio.to_thread(requests.get, "https://example.com")   # runs in a thread
    return {"status": r.status_code}


@app.get("/fixed-sync-route")
def fixed_sync_route():               # plain def -> FastAPI runs it in its thread pool
    r = requests.get("https://example.com")
    return {"status": r.status_code}
`,
    pitfalls: [
      "Vendor SDKs that look async but call sync code internally. Read the source or measure.",
      "`asyncio.to_thread` for CPU-heavy Python work only partly helps, because of the GIL. Use processes for that."
    ] },

  { type: "concept", tag: "Concept 4", h: "Running many things at once safely: gather, TaskGroup, Semaphore, timeouts",
    what: "Four tools for controlled concurrency:\n\n`asyncio.gather(*coros)` runs coroutines concurrently and returns their results in order. `asyncio.TaskGroup` (Python 3.11+) does the same, but if one task fails it **cancels the others** and raises; this is called structured concurrency. `asyncio.Semaphore(n)` is a counter that lets at most `n` coroutines into a block at once. `asyncio.timeout(seconds)` cancels anything that takes too long.",
    why: "FDE systems constantly fan out: summarise 200 documents, call 5 tools, query 3 indexes. Unbounded fan-out gets you rate-limited (HTTP 429) by the LLM provider or overloads the customer's API. Missing timeouts leave requests hanging forever when a dependency stalls.",
    how: [
      "Wrap each downstream call in `async with semaphore:` so no more than N run at once.",
      "Put a timeout on every network call, either in the client config or with `asyncio.timeout`.",
      "Decide on failure behaviour: fail the whole batch (TaskGroup) or return per-item errors (gather + try/except in each task).",
      "Create one shared HTTP client for the whole app (connection pooling), not one per request."
    ],
    code: `
import asyncio
import httpx

SEM = asyncio.Semaphore(8)                    # at most 8 calls in flight


async def summarise(client: httpx.AsyncClient, doc_id: str) -> dict:
    async with SEM:                           # waits here if 8 are already running
        try:
            async with asyncio.timeout(15):   # cancel if slower than 15 s
                r = await client.post("https://llm.internal/summarise", json={"id": doc_id})
                r.raise_for_status()
                return {"doc_id": doc_id, "summary": r.json()["text"]}
        except (httpx.HTTPError, TimeoutError) as e:
            return {"doc_id": doc_id, "error": type(e).__name__}   # per-item failure


async def summarise_all(doc_ids: list[str]) -> list[dict]:
    async with httpx.AsyncClient() as client:
        return await asyncio.gather(*(summarise(client, d) for d in doc_ids))

# 200 docs -> 200 coroutines created, but only 8 ever call the API at the same time
`,
    pitfalls: [
      "Plain `gather` without `return_exceptions=True` raises the first error but does NOT cancel the other tasks. They keep running in the background.",
      "A semaphore only limits within one process. With 4 workers × 8 = 32 concurrent calls, a shared limit needs Redis or a queue."
    ] },

  { type: "concept", tag: "Concept 5", h: "Packaging and dependencies: pyproject.toml, virtual environments, lock files",
    what: "A **virtual environment** is an isolated folder of installed packages for one project, so projects don't break each other. `pyproject.toml` is the single standard file that describes your project: its name, Python version, dependencies and tool settings. A **lock file** (`uv.lock`, `poetry.lock`) records the exact version of every package, including sub-dependencies, so every install is identical.\n\n`uv` is a fast modern tool that manages all three.",
    why: "“Works on my machine” is not acceptable at a customer. Their CI, their Docker build and their colleague's laptop must install exactly the same versions. Without a lock file, a dependency released tonight can break tomorrow's deployment.",
    how: [
      "`uv init myservice` creates `pyproject.toml` and the project layout.",
      "`uv add fastapi httpx pydantic-settings` adds runtime dependencies and updates the lock file.",
      "`uv add --dev pytest mypy ruff` adds development-only tools.",
      "`uv sync` creates `.venv` and installs exactly what the lock file says. Run it in CI and Docker.",
      "`uv run pytest` runs a command inside the project's environment.",
      "Commit both `pyproject.toml` and `uv.lock`."
    ],
    code: `
# pyproject.toml
[project]
name = "claims-extractor"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [            # ranges here; exact pins live in uv.lock
  "fastapi>=0.115",
  "httpx>=0.27",
  "pydantic-settings>=2.4",
]

[dependency-groups]
dev = ["pytest>=8", "pytest-asyncio>=0.24", "respx>=0.21", "mypy>=1.11", "ruff>=0.6"]

[tool.mypy]
strict = true

[tool.pytest.ini_options]
asyncio_mode = "auto"
`,
    example: "Recommended layout (the “src layout”): `src/claims_extractor/` for code, `tests/` for tests, `pyproject.toml` and `uv.lock` at the root. The src layout stops tests from accidentally importing your local folder instead of the installed package.",
    pitfalls: [
      "Installing packages globally with `pip install` outside a virtual environment.",
      "Not committing the lock file.",
      "Pinning exact versions in a library's `pyproject.toml`: that causes conflicts for whoever depends on it. Pin exact versions only via the lock file of an application."
    ] },

  { type: "concept", tag: "Concept 6", h: "FastAPI essentials: models, dependency injection, lifespan, errors, settings",
    what: "FastAPI is a Python web framework. You declare endpoints as functions, and FastAPI reads your type hints to validate input, convert it into Python objects, generate OpenAPI docs (at `/docs`) and serialise responses.\n\nKey parts: **Pydantic models** define request and response bodies. **`Depends()`** is dependency injection: FastAPI calls a provider function and passes its result into your handler (for example a database session or the current user). **Lifespan** runs setup code at startup and cleanup at shutdown. **`HTTPException`** returns proper error codes.",
    why: "Most FDE deliverables expose an API: a webhook receiver, an extraction service, an agent endpoint. FastAPI gives you validation, docs and async support with little code. Using DI and lifespan correctly makes the service testable and efficient.",
    how: [
      "The request arrives, and FastAPI matches the path and method to your function.",
      "Path and query parameters are parsed from the URL; the JSON body is validated against your Pydantic model. Invalid input gets an automatic 422 response with details.",
      "Each `Depends(...)` provider runs (and can itself depend on other providers). Providers that `yield` can run cleanup after the response, such as closing a DB session.",
      "Your handler runs and returns an object, which FastAPI validates against `response_model` and turns into JSON.",
      "Settings come from environment variables via `pydantic-settings`, so the same code runs in dev, staging and prod."
    ],
    code: `
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):            # reads LLM_URL, API_KEY from environment variables
    llm_url: str
    api_key: str


class ExtractIn(BaseModel):
    document_id: str = Field(min_length=1)


class ExtractOut(BaseModel):
    document_id: str
    fields: dict[str, str]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.settings = Settings()
    app.state.http = httpx.AsyncClient(timeout=20)   # one pooled client, created once
    yield                                            # the app serves requests here
    await app.state.http.aclose()                    # runs at shutdown


app = FastAPI(lifespan=lifespan)


def get_http(request: Request) -> httpx.AsyncClient:
    return request.app.state.http


def get_current_user(request: Request) -> str:       # real version: validate a JWT
    user = request.headers.get("x-user")
    if not user:
        raise HTTPException(status_code=401, detail="not authenticated")
    return user


@app.post("/extract", response_model=ExtractOut)
async def extract(
    body: ExtractIn,
    http: Annotated[httpx.AsyncClient, Depends(get_http)],
    user: Annotated[str, Depends(get_current_user)],
) -> ExtractOut:
    r = await http.post("https://llm.internal/extract", json={"id": body.document_id})
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="document not found")
    r.raise_for_status()
    return ExtractOut(document_id=body.document_id, fields=r.json()["fields"])
`,
    pitfalls: [
      "`BackgroundTasks` run in the same process after the response. If the process restarts, the work is lost. Use a real queue for anything that must not be lost.",
      "Creating a new `httpx.AsyncClient` per request, which throws away connection reuse and adds TLS handshakes every time.",
      "Returning ORM objects directly without a response model can leak internal fields."
    ] },

  { type: "concept", tag: "Concept 7", h: "Testing with pytest: fixtures, parametrize, API tests, mocking HTTP",
    what: "`pytest` runs any function named `test_*` and reports failures from plain `assert` statements. A **fixture** is reusable setup (a test client, fake data) that pytest injects into tests by parameter name. `@pytest.mark.parametrize` runs one test with many inputs. **Mocking** replaces a real dependency (an external API) with a fake that returns controlled responses.",
    why: "At a customer you can't manually re-test everything after every change, and you can't call their production APIs or pay for LLM calls in every test run. Good tests let you change code confidently, and they document expected behaviour for whoever maintains the system after you leave.",
    how: [
      "**Unit tests:** pure functions (parsing, validation, retry logic). Fast, many.",
      "**API tests:** send HTTP requests to your FastAPI app in memory using `httpx.AsyncClient` with `ASGITransport`. No real server is needed.",
      "**Override dependencies:** `app.dependency_overrides[get_current_user] = lambda: \"test-user\"` swaps a real provider for a fake one.",
      "**Mock external HTTP at the boundary** with `respx`: “when POST to this URL, return this JSON”. Your real code path runs, only the network is faked.",
      "Run with `uv run pytest -q` locally and in CI on every pull request."
    ],
    code: `
import httpx
import pytest
import respx

from claims_extractor.main import app, get_current_user


@pytest.fixture
async def client():
    app.dependency_overrides[get_current_user] = lambda: "test-user"
    transport = httpx.ASGITransport(app=app)
    async with app.router.lifespan_context(app):          # run startup/shutdown
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
    app.dependency_overrides.clear()


@respx.mock
async def test_extract_success(client):
    respx.post("https://llm.internal/extract").respond(json={"fields": {"total": "120.50"}})
    r = await client.post("/extract", json={"document_id": "doc-1"})
    assert r.status_code == 200
    assert r.json()["fields"]["total"] == "120.50"


@pytest.mark.parametrize("body", [{}, {"document_id": ""}])
async def test_extract_rejects_bad_input(client, body):
    r = await client.post("/extract", json=body)
    assert r.status_code == 422                            # Pydantic validation error
`,
    example: "This fixture needs `LLM_URL` and `API_KEY` set in the test environment (for example with `monkeypatch.setenv` in a `conftest.py`), because `Settings()` reads them at startup.",
    pitfalls: [
      "Tests that call real external APIs: slow, flaky and costly.",
      "Mocking deep inside your own code, so the test no longer exercises the real logic.",
      "Only testing the happy path. Test timeouts, 429s, bad input and partial failures."
    ] },

  { type: "csnote", items: [
    "Type hints are not enforced at runtime (C# types are). The type checker plays the role of your compiler, so run it in CI.",
    "Python coroutines share one thread per event loop; C# `Task`s run on a thread pool. CPU-bound work blocks Python's loop.",
    "No `using`/`IDisposable`: use `with` / `async with` (context managers) for cleanup.",
    "FastAPI `Depends()` is parameter-level DI, closer to ASP.NET minimal APIs than to a configured IoC container."
  ] },

  { type: "glossary", terms: [
    ["Type hint", "An annotation stating the expected type; checked by tools such as mypy/pyright, not by Python at runtime."],
    ["Coroutine", "A function defined with `async def`; it can pause at `await` and resume later."],
    ["Event loop", "The single-threaded scheduler that runs coroutines, switching between them at each `await`."],
    ["Blocking call", "Code that holds the thread without yielding to the loop (sync I/O, `time.sleep`, heavy CPU work)."],
    ["Concurrency vs parallelism", "Concurrency: many tasks in progress, taking turns. Parallelism: many tasks literally executing at the same moment."],
    ["Semaphore", "A counter limiting how many coroutines can enter a block at once."],
    ["Structured concurrency", "Child tasks are tied to a scope; if one fails the others are cancelled (`TaskGroup`)."],
    ["Virtual environment", "An isolated set of installed packages for one project."],
    ["Lock file", "Exact versions of every dependency, so installs are reproducible."],
    ["Pydantic model", "A class that validates and converts data at runtime (for example JSON request bodies)."],
    ["Dependency injection (DI)", "The framework supplies objects your function needs (DB session, user), which makes them easy to swap in tests."],
    ["Lifespan", "Startup/shutdown hook in FastAPI for creating shared resources such as HTTP clients."],
    ["Fixture", "Reusable test setup injected into pytest tests."],
    ["Mock", "A fake replacement for a real dependency, returning controlled responses."]
  ] },

  { type: "walkthrough", h: "Real FDE scenario: the pilot API that falls over under load", tag: "Scenario", steps: [
    ["The symptom", "A customer's pilot extraction API works perfectly for one tester. On the first day with 20 adjusters, p95 latency jumps from 2 seconds to 40 seconds and some requests time out."],
    ["Investigation", "Langfuse traces show the LLM calls themselves still take ~2 s. The time is spent *before* the handler even starts, so requests are queuing. Server CPU is only 15%. Low CPU plus queuing points to a blocked event loop."],
    ["Root cause", "The vendor's PDF-to-text SDK is synchronous and takes ~1.5 s per document. It was called directly inside an `async def` route, so each call froze the loop and every other request waited behind it."],
    ["Short-term fix (same day)", "Wrap the call in `await asyncio.to_thread(pdf_sdk.parse, file)`. p95 drops back to about 3 s. Deploy after a quick load test."],
    ["Proper fix (next sprint)", "Parsing moves to a background worker fed by a queue. The API returns `202 Accepted` with a job ID; the UI polls for the result. Parsing capacity now scales separately from API capacity."],
    ["Prevention", "Add a load test to CI (20 concurrent requests, fail if p95 > 5 s), enable asyncio debug logging in staging, and document in the handover guide which SDKs are synchronous."]
  ] },

  { type: "list", h: "Hands-on task (60 minutes)", tag: "Task", ordered: true, items: [
    "Run `uv init claims-extractor`, then add `fastapi`, `httpx`, `pydantic-settings`, and dev tools `pytest`, `pytest-asyncio`, `respx`, `mypy`.",
    "Implement the `/extract` endpoint from Concept 6 and a `/summaries` endpoint that fans out to up to 200 documents with a semaphore of 8 (Concept 4).",
    "Write the tests from Concept 7, plus one that proves at most 8 calls run concurrently. Hint: in the mock, increment a counter on entry, record the maximum, decrement on exit.",
    "Add a `/bad` route that uses `time.sleep(2)` inside `async def`. Send 5 concurrent requests and time them, then fix it and time again. Write down both numbers.",
    "Run `mypy --strict src` and fix every error."
  ] },

  { type: "list", h: "Practice questions", tag: "Practice", ordered: true, items: [
    "Explain to a junior engineer, without jargon, why `time.sleep(1)` inside an `async def` route slows down every user, and give two different fixes.",
    "When would you deliberately write a FastAPI route as `def` instead of `async def`?",
    "How do you test an endpoint that depends on a database session and an external LLM API, without touching either? Name the exact techniques."
  ] },

  { type: "quiz", qs: [
    ["What does Python do with type hints at runtime?", ["Enforces them and raises TypeError", "Ignores them; tools like mypy check them before running", "Converts values to the hinted type", "Uses them to speed up code"], 1, "Hints are for static checkers and IDEs. Pydantic is what validates at runtime."],
    ["Three coroutines each `await asyncio.sleep(1)`. Run with `asyncio.gather`, total time is about…", ["3 s", "1 s", "0 s", "Depends on CPU cores"], 1, "They wait concurrently; the loop switches while each one sleeps."],
    ["A synchronous SDK call inside `async def` under load causes…", ["Automatic threading", "The event loop blocks, so all requests on that worker queue up", "A syntax error", "Nothing, because of the GIL"], 1, "Only plain `def` routes are run in FastAPI's thread pool automatically."],
    ["Which tool limits how many coroutines call an API at the same time?", ["asyncio.Lock", "asyncio.Semaphore", "asyncio.Queue only", "time.sleep"], 1, "A semaphore with n permits allows n concurrent holders."],
    ["Why commit the lock file (uv.lock)?", ["It stores secrets", "So every environment installs exactly the same dependency versions", "It's required by Python", "It speeds up tests"], 1, "Reproducible installs across laptops, CI and Docker."],
    ["What does `app.dependency_overrides` let you do?", ["Skip validation", "Replace a `Depends` provider (e.g. the current user) with a fake in tests", "Change the port", "Disable middleware"], 1, "Tests control inputs without patching internals."],
    ["`asyncio.gather` with defaults, and one task raises. What happens to the others?", ["They are cancelled", "They keep running; the first exception propagates to the caller", "They are retried", "They return None"], 1, "Use a TaskGroup for cancel-on-failure, or catch per task."]
  ] },

  { type: "refs", items: [["FastAPI docs — Concurrency and async/await", "https://fastapi.tiangolo.com/async/"], ["FastAPI docs — Dependencies", "https://fastapi.tiangolo.com/tutorial/dependencies/"], ["Python docs — asyncio tasks and TaskGroup", "https://docs.python.org/3/library/asyncio-task.html"], ["uv docs — Working on projects", "https://docs.astral.sh/uv/guides/projects/"], ["mypy — Type hints cheat sheet", "https://mypy.readthedocs.io/en/stable/cheat_sheet_py3.html"]] }
]);
