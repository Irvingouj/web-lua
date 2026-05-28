-- ============================================
-- Core API Demo Script
-- Covers 20+ hard-core APIs in a real workflow
-- ============================================

print("=== DEMO: Starting core API workflow ===\n")

-- 1. page.url / page.title - Get page info
print("[1] page.url / page.title")
local url = page.url()
local title = page.title()
print("URL: " .. url)
print("Title: " .. title)
print()

-- 2. page.snapshot / page.snapshot_data - Inspect the page
print("[2] page.snapshot / page.snapshot_data")
local snap = page.snapshot_data({ interactive_only = true, max_nodes = 10 })
print("Found " .. #snap.nodes .. " interactive nodes")
print("Snapshot text length: " .. string.len(snap.text))
print()

-- 3. page.find - Find elements by selector
print("[3] page.find")
local buttons = page.find("button")
print("Found " .. #buttons .. " buttons")
print()

-- 4. web.sleep - Pause execution
print("[4] web.sleep(500)")
web.sleep(500)
print("Slept for 500ms")
print()

-- 5. web.storage.set / web.storage.get - Persist data
print("[5] web.storage.set / web.storage.get")
web.storage.set("demo_url", url)
web.storage.set("demo_title", title)
local saved_url = web.storage.get("demo_url")
print("Saved URL: " .. tostring(saved_url))
print()

-- 6. web.storage.list - List all keys
print("[6] web.storage.list")
local keys = web.storage.list()
print("Storage keys: " .. table.concat(keys, ", "))
print()

-- 7. web.storage.delete - Remove a key
print("[7] web.storage.delete")
web.storage.delete("demo_title")
print("Deleted demo_title")
print()

-- 8. fs.mkdir / fs.write / fs.write_text - File operations
print("[8] fs.mkdir / fs.write / fs.write_text")
fs.mkdir("/tmp/demo")
fs.write_text("/tmp/demo/page_info.txt", "URL: " .. url .. "\nTitle: " .. title)
print("Wrote page info to /tmp/demo/page_info.txt")
print()

-- 9. fs.read / fs.read_text - Read files
print("[9] fs.read / fs.read_text")
local content = fs.read_text("/tmp/demo/page_info.txt")
print("File content:\n" .. content)
print()

-- 10. fs.stat / fs.exists - File metadata
print("[10] fs.stat / fs.exists")
local exists = fs.exists("/tmp/demo/page_info.txt")
local stat = fs.stat("/tmp/demo/page_info.txt")
print("File exists: " .. tostring(exists))
print("File size: " .. stat.size)
print()

-- 11. fs.list / fs.copy / fs.move / fs.delete - File management
print("[11] fs.list / fs.copy / fs.move / fs.delete")
local files = fs.list("/tmp/demo")
print("Files in /tmp/demo:")
for _, f in ipairs(files) do
  print("  " .. f.name)
end
fs.copy("/tmp/demo/page_info.txt", "/tmp/demo/page_info_backup.txt")
fs.move("/tmp/demo/page_info_backup.txt", "/tmp/demo/page_info_old.txt")
fs.delete("/tmp/demo/page_info_old.txt")
print("Copy, move, delete done")
print()

-- 12. fs.hash / fs.append - Hash and append
print("[12] fs.hash / fs.append")
local hash = fs.hash("/tmp/demo/page_info.txt", "sha256")
print("File hash: " .. hash)
fs.append_text("/tmp/demo/page_info.txt", "\n-- Appended at demo time")
print("Appended timestamp to file")
print()

-- 13. path.join / path.basename / path.dirname / path.extname
print("[13] path.join / path.basename / path.dirname / path.extname")
local p = path.join("/tmp", "demo", "test.txt")
print("Joined: " .. p)
print("Basename: " .. path.basename(p))
print("Dirname: " .. path.dirname(p))
print("Extname: " .. path.extname(p))
print("Is absolute: " .. tostring(path.is_absolute(p)))
print()

-- 14. web.fetch - Network request
print("[14] web.fetch")
local resp = web.fetch("https://httpbin.org/get", { method = "GET", timeout = 5000 })
print("Status: " .. resp.status)
print("OK: " .. tostring(resp.ok))
print("Body length: " .. string.len(resp.body))
print()

-- 15. web.fetch_dom - Fetch and parse DOM
print("[15] web.fetch_dom")
local dom = web.fetch_dom("https://httpbin.org/html", { timeout = 5000, max_nodes = 20 })
print("Fetched DOM status: " .. dom.status)
print("Matches count: " .. #dom.matches)
print()

-- 16. page.snapshot_data - Another snapshot
print("[16] page.snapshot_data (again)")
local snap2 = page.snapshot_data({ max_nodes = 5 })
print("Snapshot nodes (again): " .. #snap2.nodes)
print()

-- 17. web.sleep - Another sleep
print("[17] web.sleep(300)")
web.sleep(300)
print("Slept for 300ms")
print()

-- 18. page.extract - Extract structured data
print("[18] page.extract")
local data = page.extract({"title", "url", "headings"}, { max_headings = 5 })
print("Title: " .. (data.title or "none"))
print("Headings count: " .. #data.headings)
for _, h in ipairs(data.headings) do
  print("  " .. h.tag .. ": " .. h.text)
end
print()

-- 19. page.wait_for / page.wait - Wait for elements
print("[19] page.wait_for / page.wait")
local found = page.wait_for("body", 2000)
print("Wait for body: " .. tostring(found))
page.wait(200)
print("Waited 200ms")
print()

-- 20. page.snapshot_text / page.snapshot - Snapshot aliases
print("[20] page.snapshot_text / page.snapshot")
local text = page.snapshot_text({ max_nodes = 5 })
print("Snapshot text (truncated): " .. string.sub(text, 1, 100))
print()

-- 21. host.call - Host communication
print("[21] host.call")
local ok, result = pcall(host.call, "echo", { message = "hello" })
print("Host call OK: " .. tostring(ok))
if not ok then
  print("Host call error: " .. tostring(result))
end
print()

-- 22. sidepanel.url / sidepanel.title - Sidepanel APIs
print("[22] sidepanel.url / sidepanel.title")
local sp_url = sidepanel.url()
local sp_title = sidepanel.title()
print("Sidepanel URL: " .. sp_url)
print("Sidepanel title: " .. sp_title)
print()

-- 23. web.storage.delete - Cleanup
print("[23] web.storage.delete (cleanup)")
web.storage.delete("demo_url")
print("Deleted demo_url")
print()

-- 24. fs.delete - Cleanup
print("[24] fs.delete (cleanup)")
fs.delete("/tmp/demo/page_info.txt")
print("Deleted page_info.txt")
print()

-- 25. fs.list - Verify cleanup
print("[25] fs.list (verify)")
local remaining = fs.list("/tmp/demo")
print("Remaining files in /tmp/demo: " .. #remaining)
print()

print("=== DEMO: All core APIs exercised successfully! ===")
