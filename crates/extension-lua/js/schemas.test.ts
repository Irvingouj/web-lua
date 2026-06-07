import { describe, expect, it } from "vitest";
import {
  ClipboardReadParamsSchema,
  ClipboardWriteParamsSchema,
  CookiesGetParamsSchema,
  FetchDomParamsSchema,
  FetchParamsSchema,
  HistorySearchParamsSchema,
  NotificationsCreateParamsSchema,
  PageClickParamsSchema,
  PageFillParamsSchema,
  PageGotoParamsSchema,
  PagePressParamsSchema,
  PageWaitParamsSchema,
  SidepanelSnapshotParamsSchema,
  SleepParamsSchema,
  StorageDeleteParamsSchema,
  StorageGetParamsSchema,
  StorageListParamsSchema,
  StorageSetParamsSchema,
  TabBackParamsSchema,
  TabClickParamsSchema,
  TabCreateParamsSchema,
  TabFillParamsSchema,
  TabPressParamsSchema,
  TabWaitForLoadParamsSchema,
} from "./schemas.js";

describe("FetchParamsSchema", () => {
  it("accepts valid params", () => {
    const result = FetchParamsSchema.safeParse({
      url: "https://example.com",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "hello",
      timeout: 5000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe("https://example.com");
      expect(result.data.method).toBe("POST");
      expect(result.data.headers).toEqual({
        "Content-Type": "application/json",
      });
      expect(result.data.body).toBe("hello");
      expect(result.data.timeout).toBe(5000);
    }
  });

  it("applies default values for optional fields", () => {
    const result = FetchParamsSchema.safeParse({
      url: "https://example.com",
      body: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.method).toBe("GET");
      expect(result.data.headers).toEqual({});
      expect(result.data.body).toBeNull();
      expect(result.data.timeout).toBe(30000);
    }
  });

  it("rejects missing body field", () => {
    const result = FetchParamsSchema.safeParse({
      url: "https://example.com",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const bodyIssue = result.error.issues.find((i) => i.path[0] === "body");
      expect(bodyIssue).toBeDefined();
    }
  });

  it("rejects missing required url field", () => {
    const result = FetchParamsSchema.safeParse({
      method: "GET",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const urlIssue = result.error.issues.find((i) => i.path[0] === "url");
      expect(urlIssue).toBeDefined();
    }
  });

  it("rejects invalid field types", () => {
    const result = FetchParamsSchema.safeParse({
      url: "https://example.com",
      method: 123,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const methodIssue = result.error.issues.find(
        (i) => i.path[0] === "method",
      );
      expect(methodIssue).toBeDefined();
    }
  });
});

describe("FetchDomParamsSchema", () => {
  it("accepts valid params", () => {
    const result = FetchDomParamsSchema.safeParse({
      url: "https://example.com",
      selector: "h1",
      max_text: 500,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe("https://example.com");
      expect(result.data.selector).toBe("h1");
      expect(result.data.max_text).toBe(500);
    }
  });

  it("rejects missing url field", () => {
    const result = FetchDomParamsSchema.safeParse({
      selector: "h1",
      max_text: 500,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const urlIssue = result.error.issues.find((i) => i.path[0] === "url");
      expect(urlIssue).toBeDefined();
    }
  });

  it("rejects invalid max_text type", () => {
    const result = FetchDomParamsSchema.safeParse({
      url: "https://example.com",
      selector: "h1",
      max_text: "invalid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const maxTextIssue = result.error.issues.find(
        (i) => i.path[0] === "max_text",
      );
      expect(maxTextIssue).toBeDefined();
    }
  });
});

describe("StorageGetParamsSchema", () => {
  it("accepts valid params", () => {
    const result = StorageGetParamsSchema.safeParse({ key: "my-key" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe("my-key");
    }
  });

  it("rejects missing key field", () => {
    const result = StorageGetParamsSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const keyIssue = result.error.issues.find((i) => i.path[0] === "key");
      expect(keyIssue).toBeDefined();
    }
  });

  it("rejects invalid key type", () => {
    const result = StorageGetParamsSchema.safeParse({ key: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const keyIssue = result.error.issues.find((i) => i.path[0] === "key");
      expect(keyIssue).toBeDefined();
    }
  });
});

describe("StorageSetParamsSchema", () => {
  it("accepts valid params", () => {
    const result = StorageSetParamsSchema.safeParse({
      key: "my-key",
      value: "my-value",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe("my-key");
      expect(result.data.value).toBe("my-value");
    }
  });

  it("rejects missing key field", () => {
    const result = StorageSetParamsSchema.safeParse({ value: "my-value" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const keyIssue = result.error.issues.find((i) => i.path[0] === "key");
      expect(keyIssue).toBeDefined();
    }
  });

  it("rejects missing value field", () => {
    const result = StorageSetParamsSchema.safeParse({ key: "my-key" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const valueIssue = result.error.issues.find((i) => i.path[0] === "value");
      expect(valueIssue).toBeDefined();
    }
  });
});

describe("StorageDeleteParamsSchema", () => {
  it("accepts valid params", () => {
    const result = StorageDeleteParamsSchema.safeParse({ key: "my-key" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe("my-key");
    }
  });

  it("rejects missing key field", () => {
    const result = StorageDeleteParamsSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const keyIssue = result.error.issues.find((i) => i.path[0] === "key");
      expect(keyIssue).toBeDefined();
    }
  });
});

describe("StorageListParamsSchema", () => {
  it("accepts empty object", () => {
    const result = StorageListParamsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("ClipboardReadParamsSchema", () => {
  it("accepts empty object", () => {
    const result = ClipboardReadParamsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("ClipboardWriteParamsSchema", () => {
  it("accepts valid params", () => {
    const result = ClipboardWriteParamsSchema.safeParse({ text: "hello" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as { text: string }).text).toBe("hello");
    }
  });

  it("rejects missing text field", () => {
    const result = ClipboardWriteParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("SleepParamsSchema", () => {
  it("accepts valid params", () => {
    const result = SleepParamsSchema.safeParse({ duration: 1000 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration).toBe(1000);
    }
  });

  it("rejects missing duration field", () => {
    const result = SleepParamsSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const durationIssue = result.error.issues.find(
        (i) => i.path[0] === "duration",
      );
      expect(durationIssue).toBeDefined();
    }
  });

  it("rejects invalid duration type", () => {
    const result = SleepParamsSchema.safeParse({ duration: "1000" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const durationIssue = result.error.issues.find(
        (i) => i.path[0] === "duration",
      );
      expect(durationIssue).toBeDefined();
    }
  });
});

// ─── Page action schema tests ────────────────────────────────────

describe("PageClickParamsSchema", () => {
  it("accepts valid params", () => {
    const result = PageClickParamsSchema.safeParse({
      refId: "ref-1",
      label: "Submit",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.refId).toBe("ref-1");
      expect(result.data.label).toBe("Submit");
    }
  });

  it("applies default label", () => {
    const result = PageClickParamsSchema.safeParse({ refId: "ref-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.label).toBe("");
    }
  });

  it("rejects missing refId", () => {
    const result = PageClickParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("PageFillParamsSchema", () => {
  it("accepts valid params", () => {
    const result = PageFillParamsSchema.safeParse({
      refId: "ref-1",
      label: "Email",
      value: "test@example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe("test@example.com");
    }
  });

  it("rejects missing value", () => {
    const result = PageFillParamsSchema.safeParse({ refId: "ref-1" });
    expect(result.success).toBe(false);
  });
});

describe("PageGotoParamsSchema", () => {
  it("accepts valid params", () => {
    const result = PageGotoParamsSchema.safeParse({
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe("https://example.com");
    }
  });

  it("rejects missing url", () => {
    const result = PageGotoParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("PagePressParamsSchema", () => {
  it("accepts valid params", () => {
    const result = PagePressParamsSchema.safeParse({ key: "Enter" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe("Enter");
    }
  });

  it("rejects missing key", () => {
    const result = PagePressParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("PageWaitParamsSchema", () => {
  it("accepts valid params", () => {
    const result = PageWaitParamsSchema.safeParse({ duration: 2000 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration).toBe(2000);
    }
  });

  it("applies default duration", () => {
    const result = PageWaitParamsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration).toBe(1000);
    }
  });

  it("coerces number to bigint", () => {
    const result = PageWaitParamsSchema.safeParse({ duration: 1500 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration).toBe(1500);
    }
  });
});

// ─── Tab action schema tests ─────────────────────────────────────

describe("TabClickParamsSchema", () => {
  it("accepts valid params", () => {
    const result = TabClickParamsSchema.safeParse({
      tabId: 42,
      refId: "ref-1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tabId).toBe(42);
      expect(result.data.refId).toBe("ref-1");
    }
  });

  it("coerces number tabId to bigint", () => {
    const result = TabClickParamsSchema.safeParse({ tabId: 42, refId: "x" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tabId).toBe(42);
    }
  });

  it("rejects missing refId", () => {
    const result = TabClickParamsSchema.safeParse({ tabId: 42 });
    expect(result.success).toBe(false);
  });
});

describe("TabFillParamsSchema", () => {
  it("accepts valid params", () => {
    const result = TabFillParamsSchema.safeParse({
      tabId: 42,
      refId: "ref-1",
      value: "hello",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe("hello");
    }
  });

  it("rejects missing value", () => {
    const result = TabFillParamsSchema.safeParse({
      tabId: 42,
      refId: "ref-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("TabPressParamsSchema", () => {
  it("accepts valid params", () => {
    const result = TabPressParamsSchema.safeParse({ tabId: 42, key: "Enter" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe("Enter");
    }
  });

  it("rejects missing key", () => {
    const result = TabPressParamsSchema.safeParse({ tabId: 42 });
    expect(result.success).toBe(false);
  });
});

describe("TabBackParamsSchema", () => {
  it("accepts valid params", () => {
    const result = TabBackParamsSchema.safeParse({ tabId: 42 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tabId).toBe(42);
    }
  });

  it("coerces number tabId to bigint", () => {
    const result = TabBackParamsSchema.safeParse({ tabId: 7 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tabId).toBe(7);
    }
  });

  it("rejects missing tabId", () => {
    const result = TabBackParamsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("TabWaitForLoadParamsSchema", () => {
  it("accepts valid params", () => {
    const result = TabWaitForLoadParamsSchema.safeParse({
      tabId: 42,
      timeout: 10000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeout).toBe(10000);
    }
  });

  it("applies default timeout", () => {
    const result = TabWaitForLoadParamsSchema.safeParse({ tabId: 42 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeout).toBe(30000);
    }
  });

  it("coerces number timeout to bigint", () => {
    const result = TabWaitForLoadParamsSchema.safeParse({
      tabId: 42,
      timeout: 5000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeout).toBe(5000);
    }
  });
});

// ─── Chrome passthrough schema tests ─────────────────────────────

describe("CookiesGetParamsSchema", () => {
  it("accepts valid object params", () => {
    const result = CookiesGetParamsSchema.safeParse({
      name: "session_id",
      url: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("session_id");
      expect(result.data.url).toBe("https://example.com");
    }
  });

  it("accepts empty object", () => {
    const result = CookiesGetParamsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects string params", () => {
    const result = CookiesGetParamsSchema.safeParse("session_id");
    expect(result.success).toBe(false);
  });

  it("rejects number params", () => {
    const result = CookiesGetParamsSchema.safeParse(42);
    expect(result.success).toBe(false);
  });
});

describe("HistorySearchParamsSchema", () => {
  it("accepts valid query object", () => {
    const result = HistorySearchParamsSchema.safeParse({
      text: "example",
      startTime: 1609459200000,
      maxResults: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.text).toBe("example");
      expect(result.data.maxResults).toBe(10);
    }
  });

  it("accepts empty object", () => {
    const result = HistorySearchParamsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects string params", () => {
    const result = HistorySearchParamsSchema.safeParse("example");
    expect(result.success).toBe(false);
  });
});

describe("TabCreateParamsSchema", () => {
  it("accepts valid create properties", () => {
    const result = TabCreateParamsSchema.safeParse({
      url: "https://example.com",
      active: true,
      windowId: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.url).toBe("https://example.com");
      expect(result.data.active).toBe(true);
    }
  });

  it("accepts empty object", () => {
    const result = TabCreateParamsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects string params", () => {
    const result = TabCreateParamsSchema.safeParse("https://example.com");
    expect(result.success).toBe(false);
  });
});

describe("SidepanelSnapshotParamsSchema", () => {
  it("accepts valid params", () => {
    const result = SidepanelSnapshotParamsSchema.safeParse({
      max_nodes: 100,
      interactive_only: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_nodes).toBe(100);
      expect(result.data.interactive_only).toBe(true);
    }
  });

  it("applies default values for optional fields", () => {
    const result = SidepanelSnapshotParamsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_nodes).toBe(500);
      expect(result.data.interactive_only).toBe(false);
    }
  });

  it("coerces number to bigint for max_nodes", () => {
    const result = SidepanelSnapshotParamsSchema.safeParse({
      max_nodes: 250,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_nodes).toBe(250);
    }
  });

  it("rejects invalid interactive_only type", () => {
    const result = SidepanelSnapshotParamsSchema.safeParse({
      interactive_only: "yes",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "interactive_only",
      );
      expect(issue).toBeDefined();
    }
  });
});

describe("NotificationsCreateParamsSchema", () => {
  it("accepts valid object params", () => {
    const result = NotificationsCreateParamsSchema.safeParse({
      id: "test-notif",
      options: {
        type: "basic",
        title: "Hello",
        message: "World",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("test-notif");
      expect(result.data.options.type).toBe("basic");
    }
  });

  it("accepts empty object", () => {
    const result = NotificationsCreateParamsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects string params", () => {
    const result = NotificationsCreateParamsSchema.safeParse("test-notif");
    expect(result.success).toBe(false);
  });
});
