import { describe, expect, it } from "vitest";
import {
  CHROME_PASSTHROUGH_ACTIONS,
  deriveTransport,
} from "../../src/shared/registry/routes.js";

describe("routes", () => {
  describe("deriveTransport", () => {
    it("routes page_* actions to active_tab_content_script", () => {
      expect(deriveTransport("page_click")).toBe("active_tab_content_script");
      expect(deriveTransport("page_fill")).toBe("active_tab_content_script");
      expect(deriveTransport("page_snapshot")).toBe("active_tab_content_script");
      expect(deriveTransport("page_type")).toBe("active_tab_content_script");
    });

    it("routes tab_* actions to specific_tab_content_script", () => {
      expect(deriveTransport("tab_query")).toBe("specific_tab_content_script");
      expect(deriveTransport("tab_create")).toBe("specific_tab_content_script");
      expect(deriveTransport("tab_close")).toBe("specific_tab_content_script");
      expect(deriveTransport("tab_activate")).toBe("specific_tab_content_script");
    });

    it("routes chrome_* actions to chrome_api", () => {
      expect(deriveTransport("chrome_bookmarks")).toBe("chrome_api");
      expect(deriveTransport("chrome_history")).toBe("chrome_api");
      expect(deriveTransport("chrome_cookies")).toBe("chrome_api");
    });

    it("routes sidepanel_* actions to sidepanel_dom", () => {
      expect(deriveTransport("sidepanel_open")).toBe("sidepanel_dom");
      expect(deriveTransport("sidepanel_close")).toBe("sidepanel_dom");
    });

    it("routes CHROME_PASSTHROUGH_ACTIONS to chrome_api when no prefix matches", () => {
      const nonPrefixed = [
        "cookies_get",
        "cookies_set",
        "cookies_delete",
        "cookies_list",
        "history_search",
        "history_delete",
        "bookmarks_search",
        "bookmarks_create",
        "bookmarks_delete",
        "notifications_create",
        "notifications_clear",
      ];
      for (const action of nonPrefixed) {
        expect(deriveTransport(action)).toBe("chrome_api");
      }
    });

    it("gives prefix precedence over CHROME_PASSTHROUGH_ACTIONS", () => {
      expect(deriveTransport("tab_query")).toBe("specific_tab_content_script");
      expect(deriveTransport("tab_create")).toBe("specific_tab_content_script");
      expect(deriveTransport("page_close")).toBe("active_tab_content_script");
      expect(deriveTransport("page_active_tab")).toBe("active_tab_content_script");
    });

    it("routes unknown actions to host_async", () => {
      expect(deriveTransport("fetch")).toBe("host_async");
      expect(deriveTransport("custom_action")).toBe("host_async");
      expect(deriveTransport("runtime_docs")).toBe("host_async");
    });
  });
});
