pub mod aliases;
pub mod log;
pub mod session;

pub use log::set_log_level;
pub use session::ExtensionSession;

web_lua_core::export_generate_api_docs!(ExtensionSession);

#[cfg(test)]
mod tests {
    use crate::ExtensionSession;

    #[test]
    fn test_extension_alias_docs_are_registered() {
        let _session = ExtensionSession::new();
        let registry = web_lua_core::api_docs::REGISTRY.lock().unwrap();

        // Key aliases that should be registered
        let expected_aliases = [
            ("runtime", "fetch"),
            ("runtime", "sleep"),
            ("runtime", "storage"),
            ("runtime", "clipboard"),
            ("runtime", "notifications"),
            ("tab", "query"),
            ("tab", "create"),
            ("tab", "activate"),
            ("tab", "close"),
            ("tab", "execute_script"),
            ("tab", "click"),
            ("tab", "fill"),
            ("tab", "snapshot"),
            ("tab", "snapshot_text"),
            ("tab", "snapshot_data"),
            ("tab", "scroll_to"),
            ("tab", "evaluate"),
            ("tab", "back"),
            ("tab", "wait_for_load"),
            ("tab", "fetch"),
            ("tab", "current"),
            ("tab", "url"),
            ("tab", "title"),
            ("tab", "open"),
            ("tab", "focus"),
            ("tab", "reload"),
            ("tab", "sleep"),
            ("page", "open"),
            ("page", "see"),
            ("page", "enter"),
            ("page", "wait_for_load"),
            ("page", "fetch"),
        ];

        for (ns, name) in &expected_aliases {
            assert!(
                registry
                    .iter()
                    .any(|d| d.namespace == *ns && d.name == *name),
                "Expected alias {}.{} to be registered",
                ns,
                name
            );
        }

        // Verify page.go is present as a core API (registered by page.rs), not as an alias
        let page_go = registry
            .iter()
            .find(|d| d.namespace == "page" && d.name == "go");
        assert!(
            page_go.is_some(),
            "page.go should be registered as a core API"
        );
        assert_eq!(
            page_go.unwrap().action.as_deref(),
            Some("page_goto"),
            "page.go should have action page_goto, not be an alias"
        );
    }
}
