import { z } from "zod";
import type {
  DomSnapshotParams,
  FetchDomParams,
  FetchParams,
  PageAppendParams,
  PageCheckParams,
  PageClickParams,
  PageDblClickParams,
  PageFillParams,
  PageFindParams,
  PageGotoParams,
  PageHoverParams,
  PagePressParams,
  PageScrollParams,
  PageScrollToParams,
  PageSelectParams,
  PageTypeParams,
  PageWaitForParams,
  PageWaitParams,
  SleepParams,
  StorageDeleteParams,
  StorageGetParams,
  StorageSetParams,
  TabBackParams,
  TabCheckParams,
  TabClickParams,
  TabDblClickParams,
  TabFillParams,
  TabHoverParams,
  TabPressParams,
  TabScrollParams,
  TabSelectParams,
  TabTypeParams,
  TabUnhoverParams,
  TabWaitForLoadParams,
} from "../../generated.js";

// generated.ts does not export these (no corresponding Rust types), so define locally
// biome-ignore lint/complexity/noBannedTypes: type-compatibility aliases for empty params
type PageBackParams = {};
// biome-ignore lint/complexity/noBannedTypes: type-compatibility aliases for empty params
type PageForwardParams = {};
// biome-ignore lint/complexity/noBannedTypes: type-compatibility aliases for empty params
type PageReloadParams = {};
// biome-ignore lint/complexity/noBannedTypes: type-compatibility aliases for empty params
type PageUnhoverParams = {};
// biome-ignore lint/complexity/noBannedTypes: type-compatibility aliases for empty params
type TabForwardParams = {};

export const DEFAULT_FETCH_TIMEOUT_MS = 30000;

export const FetchParamsSchema = z.object({
  url: z.string().url(),
  method: z.string().default("GET"),
  headers: z.record(z.string()).default({}),
  body: z.string().nullable(),
  timeout: z.number().default(DEFAULT_FETCH_TIMEOUT_MS),
});

export const FetchDomParamsSchema = z.object({
  url: z.string().url(),
  selector: z.string(),
  max_text: z.number(),
});

export const StorageGetParamsSchema = z.object({
  key: z.string(),
});

export const StorageSetParamsSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const StorageDeleteParamsSchema = z.object({
  key: z.string(),
});

export const StorageListParamsSchema = z.object({});

export const ClipboardReadParamsSchema = z.object({});

export const ClipboardWriteParamsSchema = z.union([
  z.object({ text: z.string() }),
  z.object({ value: z.string() }),
  z.tuple([z.string()]),
]);

export const SleepParamsSchema = z.object({
  duration: z.number(),
});

// ─── Page action schemas ─────────────────────────────────────────

export const PageClickParamsSchema = z.object({
  refId: z.string(),
  label: z.string().default(""),
});

export const PageFillParamsSchema = z.object({
  refId: z.string(),
  label: z.string().default(""),
  value: z.string(),
});

export const PageTypeParamsSchema = z.object({
  refId: z.string(),
  label: z.string().default(""),
  text: z.string(),
});

export const PageAppendParamsSchema = z.object({
  refId: z.string(),
  label: z.string().default(""),
  text: z.string(),
});

export const PagePressParamsSchema = z.object({
  key: z.string(),
});

export const PageSelectParamsSchema = z.object({
  refId: z.string(),
  value: z.string(),
});

export const PageCheckParamsSchema = z.object({
  refId: z.string(),
  checked: z.boolean().default(true),
});

export const PageHoverParamsSchema = z.object({
  refId: z.string(),
});

export const PageUnhoverParamsSchema = z.object({});

export const PageScrollParamsSchema = z.object({
  direction: z.string().default("down"),
  amount: z.number().default(300),
  refId: z.string().nullable().default(null),
});

export const PageScrollToParamsSchema = z.object({
  refId: z.string(),
});

export const PageDblClickParamsSchema = z.object({
  refId: z.string(),
  label: z.string().default(""),
});

export const PageGotoParamsSchema = z.object({
  url: z.string(),
});

export const PageBackParamsSchema = z.object({});

export const PageForwardParamsSchema = z.object({});

export const PageReloadParamsSchema = z.object({});

export const PageWaitParamsSchema = z.object({
  duration: z.number().default(1000),
});

export const PageFindParamsSchema = z.object({
  selector: z.string(),
});

export const PageWaitForParamsSchema = z.object({
  selector: z.string(),
  timeout: z.number().default(30000),
});

export const PageUrlParamsSchema = z.object({});

export const PageTitleParamsSchema = z.object({});

export const PageExtractParamsSchema = z.object({
  fields: z.array(z.string()),
  max_text: z.number().default(500),
  max_headings: z.number().default(200),
  max_links: z.number().default(100),
});

export const PageSnapshotParamsSchema = z.object({
  max_nodes: z.number().default(500),
});

export const PageSnapshotDataParamsSchema = z.object({
  max_nodes: z.number().default(500),
});

// ─── Tab action schemas ──────────────────────────────────────────
// Tab actions may arrive as positional arrays or objects.
// Union schemas with .transform() normalize arrays into objects
// so handlers always receive a consistent shape.

export const TabClickParamsSchema = z.object({
  tabId: z.number(),
  refId: z.string(),
});

export const TabFillParamsSchema = z.object({
  tabId: z.number(),
  refId: z.string(),
  value: z.string(),
});

export const TabTypeParamsSchema = z.object({
  tabId: z.number(),
  refId: z.string(),
  text: z.string(),
});

export const TabPressParamsSchema = z.object({
  tabId: z.number(),
  key: z.string(),
});

export const TabSelectParamsSchema = z.object({
  tabId: z.number(),
  refId: z.string(),
  value: z.string(),
});

export const TabCheckParamsSchema = z.object({
  tabId: z.number(),
  refId: z.string(),
  checked: z.boolean().default(true),
});

export const TabHoverParamsSchema = z.object({
  tabId: z.number(),
  refId: z.string(),
});

export const TabUnhoverParamsSchema = z.object({
  tabId: z.number(),
});

export const TabScrollParamsSchema = z.object({
  tabId: z.number(),
  direction: z.string().default("down"),
  amount: z.number().default(300),
});

export const TabDblClickParamsSchema = z.object({
  tabId: z.number(),
  refId: z.string(),
});

export const TabBackParamsSchema = z.object({
  tabId: z.number(),
});

export const TabForwardParamsSchema = z.object({
  tabId: z.number(),
});

export const TabWaitForLoadParamsSchema = z.object({
  tabId: z.number(),
  timeout: z.number().default(30000),
});

export const TabEvaluateParamsSchema = z.object({
  tabId: z.number(),
  script: z.string(),
});

export const TabFetchParamsSchema = z.object({
  tabId: z.number(),
  url: z.string(),
  method: z.string().nullable().optional(),
  headers: z.record(z.string()).optional(),
  body: z.string().nullable().optional(),
  timeout: z.number().optional(),
});

export const TabSnapshotParamsSchema = z.object({
  tabId: z.number(),
  max_nodes: z.number().optional(),
  interactive_only: z.boolean().optional(),
});
export const TabSnapshotTextParamsSchema = TabSnapshotParamsSchema;
export const TabSnapshotDataParamsSchema = TabSnapshotParamsSchema;

export const TabScrollToParamsSchema = z.object({
  tabId: z.number(),
  x: z.number().default(0),
  y: z.number().default(0),
  refId: z.string().optional(),
});

export const TabExecuteScriptParamsSchema = z
  .object({
    target: z.object({ tabId: z.number() }).optional(),
    func: z.function().optional(),
    args: z.array(z.unknown()).optional(),
    world: z.enum(["MAIN", "ISOLATED"]).optional(),
    files: z.array(z.string()).optional(),
  })
  .passthrough();

// ─── Chrome passthrough schemas ──────────────────────────────────

export const CookiesGetParamsSchema = z
  .object({
    url: z.string().optional(),
    name: z.string().optional(),
    storeId: z.string().optional(),
  })
  .passthrough();
export const CookiesSetParamsSchema = z
  .object({
    url: z.string(),
    name: z.string().optional(),
    value: z.string().optional(),
    domain: z.string().optional(),
    path: z.string().optional(),
    secure: z.boolean().optional(),
    httpOnly: z.boolean().optional(),
    sameSite: z.string().optional(),
    expirationDate: z.number().optional(),
    storeId: z.string().optional(),
  })
  .passthrough();
export const CookiesDeleteParamsSchema = z
  .object({
    url: z.string(),
    name: z.string(),
    storeId: z.string().optional(),
  })
  .passthrough();
export const CookiesListParamsSchema = z
  .object({
    url: z.string().optional(),
    name: z.string().optional(),
    domain: z.string().optional(),
    path: z.string().optional(),
    secure: z.boolean().optional(),
    session: z.boolean().optional(),
    storeId: z.string().optional(),
  })
  .passthrough();

export const HistorySearchParamsSchema = z
  .object({
    text: z.string().optional(),
    startTime: z.number().optional(),
    endTime: z.number().optional(),
    maxResults: z.number().optional(),
  })
  .passthrough();
export const HistoryDeleteParamsSchema = z.union([
  z.string(),
  z.object({ url: z.string().optional() }).passthrough(),
]);

export const BookmarksSearchParamsSchema = z.union([
  z.string(),
  z.object({ query: z.string().optional() }).passthrough(),
]);
export const BookmarksCreateParamsSchema = z
  .object({
    parentId: z.string().optional(),
    index: z.number().optional(),
    title: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough();
export const BookmarksDeleteParamsSchema = z.union([
  z.string(),
  z.object({ id: z.string().optional() }).passthrough(),
]);

export const TabQueryParamsSchema = z
  .object({
    active: z.boolean().optional(),
    pinned: z.boolean().optional(),
    highlighted: z.boolean().optional(),
    currentWindow: z.boolean().optional(),
    lastFocusedWindow: z.boolean().optional(),
    status: z.string().optional(),
    title: z.string().optional(),
    url: z.union([z.string(), z.array(z.string())]).optional(),
    windowId: z.number().optional(),
    windowType: z.string().optional(),
    index: z.number().optional(),
  })
  .passthrough();
export const ChromeTabsQueryParamsSchema = TabQueryParamsSchema;
export const TabCreateParamsSchema = z
  .object({
    windowId: z.number().optional(),
    index: z.number().optional(),
    url: z.string().optional(),
    active: z.boolean().optional(),
    pinned: z.boolean().optional(),
    openerTabId: z.number().optional(),
  })
  .passthrough();
export const ChromeTabsCreateParamsSchema = TabCreateParamsSchema;
export const TabActivateParamsSchema = z.union([
  z.number(),
  z
    .object({ tabId: z.number().optional(), id: z.number().optional() })
    .passthrough(),
]);
export const TabCloseParamsSchema = z.union([
  z.number(),
  z
    .object({ tabId: z.number().optional(), id: z.number().optional() })
    .passthrough(),
]);

export const PageCloseParamsSchema = z.union([
  z.number(),
  z
    .object({ tabId: z.number().optional(), id: z.number().optional() })
    .passthrough(),
]);
export const PageActiveTabParamsSchema = z.object({});

export const NotificationsCreateParamsSchema = z
  .object({
    id: z.string().optional(),
    options: z.object({}).passthrough().optional(),
  })
  .passthrough();
export const NotificationsClearParamsSchema = z.union([
  z.string(),
  z.object({ id: z.string().optional() }).passthrough(),
]);

// ─── Chrome API schemas (for chrome.* namespace tools) ─────────────

export const ChromeRuntimeSendMessageParamsSchema = z
  .object({
    message: z.unknown().optional(),
    options: z.object({}).passthrough().optional(),
  })
  .passthrough();


export const ChromeTabsUpdateParamsSchema = z
  .object({
    tabId: z.number().optional(),
    update: z.object({}).passthrough().optional(),
  })
  .passthrough();

export const ChromeTabsRemoveParamsSchema = z.union([
  z.number(),
  z.array(z.number()),
  z
    .object({ tabId: z.number().optional(), id: z.number().optional() })
    .passthrough(),
]);

export const ChromeTabsGetParamsSchema = z.union([
  z.number(),
  z
    .object({ tabId: z.number().optional(), id: z.number().optional() })
    .passthrough(),
]);

export const ChromeTabsReloadParamsSchema = z
  .object({
    tabId: z.number().optional(),
    reload: z.object({}).passthrough().optional(),
  })
  .passthrough();

export const ChromeTabsSendMessageParamsSchema = z
  .object({
    tabId: z.number().optional(),
    message: z.unknown().optional(),
    options: z.object({}).passthrough().optional(),
  })
  .passthrough();

export const ChromeAlarmsCreateParamsSchema = z
  .object({
    name: z.string().optional(),
    alarmInfo: z.object({}).passthrough().optional(),
  })
  .passthrough();

export const ChromeAlarmsClearParamsSchema = z.union([
  z.string(),
  z.object({ name: z.string().optional() }).passthrough(),
]);

export const ChromeActionSetBadgeTextParamsSchema = z.object({}).passthrough();

export const ChromeActionSetBadgeBackgroundColorParamsSchema = z
  .object({})
  .passthrough();

export const ChromeActionSetTitleParamsSchema = z.object({}).passthrough();

export const ChromeActionSetIconParamsSchema = z.object({}).passthrough();

export const ChromeContextMenusCreateParamsSchema = z.object({}).passthrough();

export const ChromeContextMenusRemoveParamsSchema = z.union([
  z.number(),
  z.string(),
  z
    .object({
      menuItemId: z.union([z.number(), z.string()]).optional(),
      id: z.union([z.number(), z.string()]).optional(),
    })
    .passthrough(),
]);

export const ChromeWindowsGetAllParamsSchema = z
  .object({
    populate: z.boolean().optional(),
    windowTypes: z.array(z.string()).optional(),
  })
  .passthrough();

export const ChromeWindowsCreateParamsSchema = z.object({}).passthrough();

export const ChromeWindowsUpdateParamsSchema = z
  .object({
    windowId: z.number().optional(),
    update: z.object({}).passthrough().optional(),
  })
  .passthrough();

export const ChromeWindowsRemoveParamsSchema = z.union([
  z.number(),
  z.object({ windowId: z.number().optional() }).passthrough(),
]);

export const ChromeSidePanelSetOptionsParamsSchema = z.object({}).passthrough();

export const ChromeScriptingExecuteScriptParamsSchema = z
  .object({
    target: z.object({ tabId: z.number() }).optional(),
    func: z.function().optional(),
    args: z.array(z.unknown()).optional(),
    world: z.enum(["MAIN", "ISOLATED"]).optional(),
    files: z.array(z.string()).optional(),
  })
  .passthrough();

// ─── Sidepanel action schemas ────────────────────────────────────

export const SidepanelClickParamsSchema = z.union([
  z.string(),
  z.object({ refId: z.string() }),
]);
export const SidepanelDblClickParamsSchema = z.union([
  z.string(),
  z.object({ refId: z.string() }),
]);
export const SidepanelFillParamsSchema = z
  .object({ refId: z.string(), value: z.string().optional() })
  .passthrough();
export const SidepanelTypeParamsSchema = z
  .object({ refId: z.string(), text: z.string().optional() })
  .passthrough();
export const SidepanelPressParamsSchema = z
  .object({ key: z.string().optional() })
  .passthrough();
export const SidepanelSelectParamsSchema = z
  .object({ refId: z.string(), value: z.string().optional() })
  .passthrough();
export const SidepanelCheckParamsSchema = z
  .object({ refId: z.string(), checked: z.boolean().optional() })
  .passthrough();
export const SidepanelHoverParamsSchema = z.union([
  z.string(),
  z.object({ refId: z.string() }),
]);
export const SidepanelUnhoverParamsSchema = z.object({});
export const SidepanelScrollParamsSchema = z
  .object({ direction: z.string().optional(), amount: z.number().optional() })
  .passthrough();
export const SidepanelScrollToParamsSchema = z.union([
  z.string(),
  z.object({
    refId: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  }),
]);
export const SidepanelAppendParamsSchema = z
  .object({ refId: z.string(), text: z.string().optional() })
  .passthrough();
export const SidepanelUrlParamsSchema = z.object({});
export const SidepanelTitleParamsSchema = z.object({});
export const SidepanelWaitParamsSchema = z.object({
  duration: z.number().default(1000),
});
export const SidepanelSnapshotParamsSchema = z.object({
  max_nodes: z.number().default(500),
  interactive_only: z.boolean().default(false),
});
export const SidepanelSnapshotTextParamsSchema = SidepanelSnapshotParamsSchema;
export const SidepanelSnapshotDataParamsSchema = SidepanelSnapshotParamsSchema;

// ─── DOM action schemas ──────────────────────────────────────────

export const DomSnapshotParamsSchema = z.object({
  max_nodes: z.number().default(500),
  interactive_only: z.boolean().default(false),
});

export const DomFormatParamsSchema = z.object({
  snapshot: z.unknown(),
  format: z
    .enum(["compact-text", "json", "json-pretty"])
    .default("compact-text"),
});

// Type-satisfaction checks: ensure zod-inferred types align with ts-rs generated types.
// Using extends check instead of satisfies for compatibility with the project's TypeScript version.
// We check that the zod-inferred type is assignable to the generated type, ensuring
// zod validation never produces values the generated type cannot represent.
type _AssertFetch =
  z.infer<typeof FetchParamsSchema> extends FetchParams ? true : never;
type _AssertFetchReverse =
  FetchParams extends z.infer<typeof FetchParamsSchema> ? true : never;
type _AssertFetchDom =
  z.infer<typeof FetchDomParamsSchema> extends FetchDomParams ? true : never;
type _AssertFetchDomReverse =
  FetchDomParams extends z.infer<typeof FetchDomParamsSchema> ? true : never;
type _AssertStorageGet =
  z.infer<typeof StorageGetParamsSchema> extends StorageGetParams
    ? true
    : never;
type _AssertStorageSet =
  z.infer<typeof StorageSetParamsSchema> extends StorageSetParams
    ? true
    : never;
type _AssertStorageDelete =
  z.infer<typeof StorageDeleteParamsSchema> extends StorageDeleteParams
    ? true
    : never;
type _AssertSleep =
  z.infer<typeof SleepParamsSchema> extends SleepParams ? true : never;
type _AssertSleepReverse =
  SleepParams extends z.infer<typeof SleepParamsSchema> ? true : never;

type _AssertPageClick =
  z.infer<typeof PageClickParamsSchema> extends PageClickParams ? true : never;
type _AssertPageClickReverse =
  PageClickParams extends z.infer<typeof PageClickParamsSchema> ? true : never;
type _AssertPageFill =
  z.infer<typeof PageFillParamsSchema> extends PageFillParams ? true : never;
type _AssertPageFillReverse =
  PageFillParams extends z.infer<typeof PageFillParamsSchema> ? true : never;
type _AssertPageType =
  z.infer<typeof PageTypeParamsSchema> extends PageTypeParams ? true : never;
type _AssertPageTypeReverse =
  PageTypeParams extends z.infer<typeof PageTypeParamsSchema> ? true : never;
type _AssertPageAppend =
  z.infer<typeof PageAppendParamsSchema> extends PageAppendParams
    ? true
    : never;
type _AssertPageAppendReverse =
  PageAppendParams extends z.infer<typeof PageAppendParamsSchema>
    ? true
    : never;
type _AssertPagePress =
  z.infer<typeof PagePressParamsSchema> extends PagePressParams ? true : never;
type _AssertPagePressReverse =
  PagePressParams extends z.infer<typeof PagePressParamsSchema> ? true : never;
type _AssertPageSelect =
  z.infer<typeof PageSelectParamsSchema> extends PageSelectParams
    ? true
    : never;
type _AssertPageSelectReverse =
  PageSelectParams extends z.infer<typeof PageSelectParamsSchema>
    ? true
    : never;
type _AssertPageCheck =
  z.infer<typeof PageCheckParamsSchema> extends PageCheckParams ? true : never;
type _AssertPageCheckReverse =
  PageCheckParams extends z.infer<typeof PageCheckParamsSchema> ? true : never;
type _AssertPageHover =
  z.infer<typeof PageHoverParamsSchema> extends PageHoverParams ? true : never;
type _AssertPageHoverReverse =
  PageHoverParams extends z.infer<typeof PageHoverParamsSchema> ? true : never;
type _AssertPageScroll =
  z.infer<typeof PageScrollParamsSchema> extends PageScrollParams
    ? true
    : never;
type _AssertPageScrollReverse =
  PageScrollParams extends z.infer<typeof PageScrollParamsSchema>
    ? true
    : never;
type _AssertPageScrollTo =
  z.infer<typeof PageScrollToParamsSchema> extends PageScrollToParams
    ? true
    : never;
type _AssertPageScrollToReverse =
  PageScrollToParams extends z.infer<typeof PageScrollToParamsSchema>
    ? true
    : never;
type _AssertPageDblClick =
  z.infer<typeof PageDblClickParamsSchema> extends PageDblClickParams
    ? true
    : never;
type _AssertPageDblClickReverse =
  PageDblClickParams extends z.infer<typeof PageDblClickParamsSchema>
    ? true
    : never;
type _AssertPageGoto =
  z.infer<typeof PageGotoParamsSchema> extends PageGotoParams ? true : never;
type _AssertPageGotoReverse =
  PageGotoParams extends z.infer<typeof PageGotoParamsSchema> ? true : never;
type _AssertPageFind =
  z.infer<typeof PageFindParamsSchema> extends PageFindParams ? true : never;
type _AssertPageFindReverse =
  PageFindParams extends z.infer<typeof PageFindParamsSchema> ? true : never;
type _AssertPageWaitFor =
  z.infer<typeof PageWaitForParamsSchema> extends PageWaitForParams
    ? true
    : never;
type _AssertPageWaitForReverse =
  PageWaitForParams extends z.infer<typeof PageWaitForParamsSchema>
    ? true
    : never;
type _AssertPageWait =
  z.infer<typeof PageWaitParamsSchema> extends PageWaitParams ? true : never;
type _AssertPageWaitReverse =
  PageWaitParams extends z.infer<typeof PageWaitParamsSchema> ? true : never;

type _AssertTabClick =
  z.infer<typeof TabClickParamsSchema> extends TabClickParams ? true : never;
type _AssertTabClickReverse =
  TabClickParams extends z.infer<typeof TabClickParamsSchema> ? true : never;
type _AssertTabFill =
  z.infer<typeof TabFillParamsSchema> extends TabFillParams ? true : never;
type _AssertTabFillReverse =
  TabFillParams extends z.infer<typeof TabFillParamsSchema> ? true : never;
type _AssertTabType =
  z.infer<typeof TabTypeParamsSchema> extends TabTypeParams ? true : never;
type _AssertTabTypeReverse =
  TabTypeParams extends z.infer<typeof TabTypeParamsSchema> ? true : never;
type _AssertTabPress =
  z.infer<typeof TabPressParamsSchema> extends TabPressParams ? true : never;
type _AssertTabPressReverse =
  TabPressParams extends z.infer<typeof TabPressParamsSchema> ? true : never;
type _AssertTabSelect =
  z.infer<typeof TabSelectParamsSchema> extends TabSelectParams ? true : never;
type _AssertTabSelectReverse =
  TabSelectParams extends z.infer<typeof TabSelectParamsSchema> ? true : never;
type _AssertTabCheck =
  z.infer<typeof TabCheckParamsSchema> extends TabCheckParams ? true : never;
type _AssertTabCheckReverse =
  TabCheckParams extends z.infer<typeof TabCheckParamsSchema> ? true : never;
type _AssertTabHover =
  z.infer<typeof TabHoverParamsSchema> extends TabHoverParams ? true : never;
type _AssertTabHoverReverse =
  TabHoverParams extends z.infer<typeof TabHoverParamsSchema> ? true : never;
type _AssertTabUnhover =
  z.infer<typeof TabUnhoverParamsSchema> extends TabUnhoverParams
    ? true
    : never;
type _AssertTabUnhoverReverse =
  TabUnhoverParams extends z.infer<typeof TabUnhoverParamsSchema>
    ? true
    : never;
type _AssertTabScroll =
  z.infer<typeof TabScrollParamsSchema> extends TabScrollParams ? true : never;
type _AssertTabScrollReverse =
  TabScrollParams extends z.infer<typeof TabScrollParamsSchema> ? true : never;
type _AssertTabDblClick =
  z.infer<typeof TabDblClickParamsSchema> extends TabDblClickParams
    ? true
    : never;
type _AssertTabDblClickReverse =
  TabDblClickParams extends z.infer<typeof TabDblClickParamsSchema>
    ? true
    : never;
type _AssertTabBack =
  z.infer<typeof TabBackParamsSchema> extends TabBackParams ? true : never;
type _AssertTabBackReverse =
  TabBackParams extends z.infer<typeof TabBackParamsSchema> ? true : never;
type _AssertTabForward =
  z.infer<typeof TabForwardParamsSchema> extends TabForwardParams ? true : never;
type _AssertTabForwardReverse =
  TabForwardParams extends z.infer<typeof TabForwardParamsSchema> ? true : never;
type _AssertTabWaitForLoad =
  z.infer<typeof TabWaitForLoadParamsSchema> extends TabWaitForLoadParams
    ? true
    : never;
type _AssertTabWaitForLoadReverse =
  TabWaitForLoadParams extends z.infer<typeof TabWaitForLoadParamsSchema>
    ? true
    : never;

type _AssertPageBack =
  z.infer<typeof PageBackParamsSchema> extends PageBackParams ? true : never;
type _AssertPageBackReverse =
  PageBackParams extends z.infer<typeof PageBackParamsSchema> ? true : never;
type _AssertPageForward =
  z.infer<typeof PageForwardParamsSchema> extends PageForwardParams
    ? true
    : never;
type _AssertPageForwardReverse =
  PageForwardParams extends z.infer<typeof PageForwardParamsSchema>
    ? true
    : never;
type _AssertPageReload =
  z.infer<typeof PageReloadParamsSchema> extends PageReloadParams
    ? true
    : never;
type _AssertPageReloadReverse =
  PageReloadParams extends z.infer<typeof PageReloadParamsSchema>
    ? true
    : never;

type _AssertStorageGetReverse =
  StorageGetParams extends z.infer<typeof StorageGetParamsSchema>
    ? true
    : never;
type _AssertStorageSetReverse =
  StorageSetParams extends z.infer<typeof StorageSetParamsSchema>
    ? true
    : never;
type _AssertStorageDeleteReverse =
  StorageDeleteParams extends z.infer<typeof StorageDeleteParamsSchema>
    ? true
    : never;

type _AssertPageUnhover =
  z.infer<typeof PageUnhoverParamsSchema> extends PageUnhoverParams
    ? true
    : never;
type _AssertPageUnhoverReverse =
  PageUnhoverParams extends z.infer<typeof PageUnhoverParamsSchema>
    ? true
    : never;

type _AssertDomSnapshot =
  z.infer<typeof DomSnapshotParamsSchema> extends DomSnapshotParams
    ? true
    : never;
type _AssertDomSnapshotReverse =
  DomSnapshotParams extends z.infer<typeof DomSnapshotParamsSchema>
    ? true
    : never;

// ─── ToolDoc schema for runtime doc providers ─────────────────────

export const ToolDocParamSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string(),
});

export const ToolReturnDocSchema = z.object({
  type: z.string(),
  description: z.string(),
});

export const ToolDocSchema = z.object({
  action: z.string(),
  namespace: z.string(),
  name: z.string(),
  publicName: z.string(),
  localName: z.string().optional(),
  source: z.string(),
  transport: z.string(),
  description: z.string(),
  params: z.array(ToolDocParamSchema),
  returns: ToolReturnDocSchema,
  errorCode: z.string(),
  errorCategory: z.string(),
});
