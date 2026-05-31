import { z } from "zod";
import type {
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
} from "./generated.js";

// generated.ts does not export these (no corresponding Rust types), so define locally
// biome-ignore lint/complexity/noBannedTypes: type-compatibility aliases for empty params
type PageBackParams = {};
// biome-ignore lint/complexity/noBannedTypes: type-compatibility aliases for empty params
type PageForwardParams = {};
// biome-ignore lint/complexity/noBannedTypes: type-compatibility aliases for empty params
type PageReloadParams = {};
// biome-ignore lint/complexity/noBannedTypes: type-compatibility aliases for empty params
type PageUnhoverParams = {};

export const DEFAULT_FETCH_TIMEOUT_MS = 30000n;

export const FetchParamsSchema = z.object({
  url: z.string().url(),
  method: z.string().default("GET"),
  headers: z.record(z.string()).default({}),
  body: z.string().nullable(),
  timeout: z.bigint().default(DEFAULT_FETCH_TIMEOUT_MS),
});

export const FetchDomParamsSchema = z.object({
  url: z.string().url(),
  selector: z.string(),
  max_text: z.bigint(),
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
  duration: z.bigint(),
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
  duration: z.coerce.bigint().default(1000n),
});

export const PageFindParamsSchema = z.object({
  selector: z.string(),
});

export const PageWaitForParamsSchema = z.object({
  selector: z.string(),
  timeout: z.coerce.bigint().default(30000n),
});

// ─── Tab action schemas ──────────────────────────────────────────
// Tab actions may arrive as positional arrays or objects.
// Union schemas with .transform() normalize arrays into objects
// so handlers always receive a consistent shape.

export const TabClickParamsSchema = z.object({
  tabId: z.coerce.bigint(),
  refId: z.string(),
});

export const TabFillParamsSchema = z.object({
  tabId: z.coerce.bigint(),
  refId: z.string(),
  value: z.string(),
});

export const TabTypeParamsSchema = z.object({
  tabId: z.coerce.bigint(),
  refId: z.string(),
  text: z.string(),
});

export const TabPressParamsSchema = z.object({
  tabId: z.coerce.bigint(),
  key: z.string(),
});

export const TabSelectParamsSchema = z.object({
  tabId: z.coerce.bigint(),
  refId: z.string(),
  value: z.string(),
});

export const TabCheckParamsSchema = z.object({
  tabId: z.coerce.bigint(),
  refId: z.string(),
  checked: z.boolean().default(true),
});

export const TabHoverParamsSchema = z.object({
  tabId: z.coerce.bigint(),
  refId: z.string(),
});

export const TabUnhoverParamsSchema = z.object({
  tabId: z.coerce.bigint(),
});

export const TabScrollParamsSchema = z.object({
  tabId: z.coerce.bigint(),
  direction: z.string().default("down"),
  amount: z.number().default(300),
});

export const TabDblClickParamsSchema = z.object({
  tabId: z.coerce.bigint(),
  refId: z.string(),
});

export const TabBackParamsSchema = z.object({
  tabId: z.coerce.bigint(),
});

export const TabWaitForLoadParamsSchema = z.object({
  tabId: z.coerce.bigint(),
  timeout: z.coerce.bigint().default(30000n),
});

// ─── Chrome passthrough schemas ──────────────────────────────────

export const CookiesGetParamsSchema = z.record(z.any());
export const CookiesSetParamsSchema = z.record(z.any());
export const CookiesDeleteParamsSchema = z.record(z.any());
export const CookiesListParamsSchema = z.record(z.any());

export const HistorySearchParamsSchema = z.record(z.any());
export const HistoryDeleteParamsSchema = z.union([
  z.string(),
  z.record(z.any()),
]);

export const BookmarksSearchParamsSchema = z.union([
  z.string(),
  z.record(z.any()),
]);
export const BookmarksCreateParamsSchema = z.record(z.any());
export const BookmarksDeleteParamsSchema = z.union([
  z.string(),
  z.record(z.any()),
]);

export const TabQueryParamsSchema = z.record(z.any());
export const TabCreateParamsSchema = z.record(z.any());
export const TabActivateParamsSchema = z.union([z.number(), z.record(z.any())]);
export const TabCloseParamsSchema = z.union([z.number(), z.record(z.any())]);

export const PageCloseParamsSchema = z.union([z.number(), z.record(z.any())]);
export const PageActiveTabParamsSchema = z.object({});

export const NotificationsCreateParamsSchema = z.record(z.any());
export const NotificationsClearParamsSchema = z.union([
  z.string(),
  z.record(z.any()),
]);

// ─── Sidepanel action schemas ────────────────────────────────────

export const SidepanelClickParamsSchema = z.union([
  z.string(),
  z.record(z.any()),
]);
export const SidepanelDblClickParamsSchema = z.union([
  z.string(),
  z.record(z.any()),
]);
export const SidepanelFillParamsSchema = z.record(z.any());
export const SidepanelTypeParamsSchema = z.record(z.any());
export const SidepanelPressParamsSchema = z.record(z.any());
export const SidepanelSelectParamsSchema = z.record(z.any());
export const SidepanelCheckParamsSchema = z.record(z.any());
export const SidepanelHoverParamsSchema = z.union([
  z.string(),
  z.record(z.any()),
]);
export const SidepanelUnhoverParamsSchema = z.union([
  z.string(),
  z.record(z.any()),
]);
export const SidepanelScrollParamsSchema = z.record(z.any());
export const SidepanelScrollToParamsSchema = z.union([
  z.string(),
  z.record(z.any()),
]);
export const SidepanelAppendParamsSchema = z.record(z.any());
export const SidepanelUrlParamsSchema = z.object({});
export const SidepanelTitleParamsSchema = z.object({});
export const SidepanelWaitParamsSchema = z.object({
  duration: z.coerce.bigint().default(1000n),
});
export const SidepanelSnapshotParamsSchema = z.object({
  max_nodes: z.coerce.bigint().default(500n),
  interactive_only: z.boolean().default(false),
});
export const SidepanelSnapshotTextParamsSchema = z.object({
  max_nodes: z.coerce.bigint().default(500n),
  interactive_only: z.boolean().default(false),
});
export const SidepanelSnapshotDataParamsSchema = z.object({
  max_nodes: z.coerce.bigint().default(500n),
  interactive_only: z.boolean().default(false),
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
