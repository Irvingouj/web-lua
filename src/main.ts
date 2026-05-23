// ── Lua Playground — Main Thread ───────────────────────────────────────

import "./style.css";

// ── DOM refs ───────────────────────────────────────────────────────────

const codeEl       = document.getElementById("code") as HTMLTextAreaElement;
const stdinEl      = document.getElementById("stdin") as HTMLTextAreaElement;
const stdoutEl     = document.getElementById("stdout") as HTMLElement;
const resultEl     = document.getElementById("result") as HTMLElement;
const errorsEl     = document.getElementById("errors") as HTMLElement;
const btnRun       = document.getElementById("btn-run") as HTMLButtonElement;
const btnStop      = document.getElementById("btn-stop") as HTMLButtonElement;
const btnClear     = document.getElementById("btn-clear") as HTMLButtonElement;
const exampleSel   = document.getElementById("example-select") as HTMLSelectElement;
const statusEl     = document.getElementById("status") as HTMLElement;

// ── Example snippets ───────────────────────────────────────────────────

const EXAMPLES: Record<string, { code: string; stdin: string }> = {
  default: {
    code: `print("hello from lua")\nprint("input was:", input())\n\nlocal line1 = read()\nlocal line2 = read()\n\nprint("line1:", line1)\nprint("line2:", line2)\n\nreturn 1 + 2`,
    stdin: "abc\ndef",
  },
  hello: {
    code: `print("hello")\nprint("world")`,
    stdin: "",
  },
  math: {
    code: `print(1 + 2)\nprint(10 / 3)\nprint(math.sqrt(144))\nprint(math.pi)\n\nreturn 42`,
    stdin: "",
  },
  tables: {
    code: `local t = {10, 20, 30}\nprint(t[1], t[2], t[3])\n\nt.name = "test"\nfor k, v in pairs(t) do\n  print(k, v)\nend\n\nreturn t`,
    stdin: "",
  },
  stdin: {
    code: `local a = read()\nlocal b = read()\nprint("got:", a, b)\nlocal c = read()\nprint("exhausted:", c)`,
    stdin: "first\nsecond",
  },
  input: {
    code: `local all = input()\nprint("all:", all)`,
    stdin: "line1\nline2\nline3",
  },
  error: {
    code: `print("before error")\nerror("boom")\nprint("after error")`,
    stdin: "",
  },
  unsafe: {
    code: `print("os:", os)\nprint("require:", require)\nprint("io:", io)\nprint("debug:", debug)`,
    stdin: "",
  },
};

// ── Worker management ──────────────────────────────────────────────────

let worker: Worker | null = null;

function createWorker(): void {
  if (worker) worker.terminate();

  worker = new Worker("/worker.js");
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (e) => {
    setStatus("Worker error", true);
    setOutput({ error: "Worker error: " + (e.message || "unknown") });
  };
}

function handleWorkerMessage(e: MessageEvent): void {
  const msg = e.data;
  switch (msg.type) {
    case "ready":
      setStatus("Ready");
      btnRun.disabled = false;
      break;
    case "result":
      btnRun.disabled = false;
      btnStop.disabled = true;
      setOutput(msg.data);
      setStatus("Done");
      break;
    case "error":
      btnRun.disabled = false;
      btnStop.disabled = true;
      setOutput({ error: msg.error });
      setStatus("Error", true);
      break;
  }
}

// ── Output rendering ───────────────────────────────────────────────────

interface LuaResult {
  stdout: string[];
  stderr: string[];
  result: string | null;
  error: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function setOutput(data: Partial<LuaResult>): void {
  if (data.stdout && data.stdout.length > 0) {
    stdoutEl.textContent = data.stdout.map(escapeHtml).join("\n");
  } else if (data.error) {
    // keep previous stdout on error
  } else {
    stdoutEl.textContent = "";
  }

  if (data.result !== undefined) {
    resultEl.textContent = data.result ?? "";
  }

  if (data.error) {
    errorsEl.textContent = data.error;
  } else if (data.stderr && data.stderr.length > 0) {
    errorsEl.textContent = data.stderr.join("\n");
  } else if (!data.error) {
    errorsEl.textContent = "";
  }
}

function clearOutput(): void {
  stdoutEl.textContent = "";
  resultEl.textContent = "";
  errorsEl.textContent = "";
}

function setStatus(msg: string, isErr = false): void {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isErr);
}

// ── Actions ────────────────────────────────────────────────────────────

function runCode(): void {
  if (!worker) return;
  clearOutput();
  setStatus("Running…");
  btnRun.disabled = true;
  btnStop.disabled = false;
  worker.postMessage({
    code: codeEl.value,
    stdin: stdinEl.value,
  });
}

function stopWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  createWorker();
  setStatus("Stopped");
  btnRun.disabled = true; // will re-enable when worker says ready
  btnStop.disabled = true;
}

function loadExample(name: string): void {
  const ex = EXAMPLES[name];
  if (ex) {
    codeEl.value = ex.code;
    stdinEl.value = ex.stdin;
  }
}

// ── Event wiring ───────────────────────────────────────────────────────

btnRun.addEventListener("click", runCode);
btnStop.addEventListener("click", stopWorker);
btnClear.addEventListener("click", clearOutput);
exampleSel.addEventListener("change", () => loadExample(exampleSel.value));

// Ctrl+Enter to run
codeEl.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runCode();
  }
  // Tab inserts tab instead of moving focus
  if (e.key === "Tab") {
    e.preventDefault();
    const start = codeEl.selectionStart;
    const end = codeEl.selectionEnd;
    codeEl.value = codeEl.value.substring(0, start) + "  " + codeEl.value.substring(end);
    codeEl.selectionStart = codeEl.selectionEnd = start + 2;
  }
});

// ── Init ───────────────────────────────────────────────────────────────

createWorker();
loadExample("default");
