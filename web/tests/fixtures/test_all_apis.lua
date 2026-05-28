-- Comprehensive smoke test for all web-lua APIs
-- Each test prints a marker so the e2e runner can assert on it.

local function ok(name) print("TEST_API_OK:" .. name) end
local function err(name, msg) print("TEST_API_ERR:" .. name .. ":" .. tostring(msg)) end

-- ─── Helpers ─────────────────────────────────────────────────

local function find_node(snap, role_or_tag)
  for _, node in ipairs(snap.nodes) do
    if node.role == role_or_tag or node.tag == role_or_tag then
      return node
    end
  end
  return nil
end

local function pcall_ok(name, fn, ...)
  local status, result = pcall(fn, ...)
  if status then
    ok(name)
  else
    err(name, result)
  end
  return status, result
end

-- ─── page snapshot APIs ─────────────────────────────────────

local snap = page.snapshot_data()
ok("page.snapshot_data")

local snap_text = page.snapshot()
ok("page.snapshot")

local snap_text2 = page.snapshot_text()
ok("page.snapshot_text")

local snap_text3 = page.see()
ok("page.see")

-- ─── page info APIs ─────────────────────────────────────────

pcall_ok("page.url", page.url)
pcall_ok("page.title", page.title)

-- ─── page find / extract / wait ───────────────────────────

local found = page.find("button")
if found and #found > 0 then ok("page.find") else err("page.find", "no results") end

local extracted = page.extract({"title"})
if extracted and extracted.title then ok("page.extract") else err("page.extract", "no title") end

local waited = page.wait_for("button", 500)
if waited then ok("page.wait_for") else err("page.wait_for", "timeout") end

-- ─── page navigation APIs ─────────────────────────────────

pcall_ok("page.wait", page.wait, 50)

-- ─── fs APIs ──────────────────────────────────────────────

local fs_path = "/tmp/test_api"
local fs_text = "/tmp/test_api_text"

pcall_ok("fs.write", fs.write, fs_path, "hello")
pcall_ok("fs.write_text", fs.write_text, fs_text, "hello text")
pcall_ok("fs.exists", fs.exists, fs_path)
pcall_ok("fs.read", fs.read, fs_path)
pcall_ok("fs.read_text", fs.read_text, fs_text)
pcall_ok("fs.stat", fs.stat, fs_path)
pcall_ok("fs.list", fs.list, "/tmp")
pcall_ok("fs.append", fs.append, fs_path, " world")
pcall_ok("fs.append_text", fs.append_text, fs_text, " world")
pcall_ok("fs.hash", fs.hash, fs_path, "sha256")

local fs_copy = "/tmp/test_api_copy"
pcall_ok("fs.copy", fs.copy, fs_path, fs_copy)

local fs_move = "/tmp/test_api_move"
pcall_ok("fs.move", fs.move, fs_copy, fs_move)

pcall_ok("fs.delete", fs.delete, fs_path)
pcall_ok("fs.delete", fs.delete, fs_text)
pcall_ok("fs.delete", fs.delete, fs_move)

local fs_dir = "/tmp/test_api_dir"
pcall_ok("fs.mkdir", fs.mkdir, fs_dir)

-- ─── web APIs ─────────────────────────────────────────────

pcall_ok("web.sleep", web.sleep, 50)

pcall_ok("web.mock_async", web.mock_async, "label")

-- ─── dom APIs ─────────────────────────────────────────────

pcall_ok("dom.snapshot", dom.snapshot)

local fmt = dom.format(snap, "compact-text")
if fmt then ok("dom.format") else err("dom.format", "nil result") end

-- ─── path APIs ────────────────────────────────────────────

pcall_ok("path.join", path.join, "a", "b")
pcall_ok("path.basename", path.basename, "/a/b.txt")
pcall_ok("path.dirname", path.dirname, "/a/b.txt")
pcall_ok("path.extname", path.extname, "/a/b.txt")
pcall_ok("path.normalize", path.normalize, "/a/../b")
pcall_ok("path.is_absolute", path.is_absolute, "/a/b")

-- ─── storage APIs ─────────────────────────────────────────

pcall_ok("web.storage.set", web.storage.set, "test_key", "test_value")
pcall_ok("web.storage.get", web.storage.get, "test_key")
pcall_ok("web.storage.list", web.storage.list)
pcall_ok("web.storage.delete", web.storage.delete, "test_key")

-- ─── host API ─────────────────────────────────────────────

pcall_ok("host.call", host.call, "echo", {})

-- ─── sidepanel APIs ─────────────────────────────────────────

pcall_ok("sidepanel.url", sidepanel.url)
pcall_ok("sidepanel.title", sidepanel.title)

-- ─── page interaction APIs (need refs) ─────────────────────

local btn = find_node(snap, "button")
local input = find_node(snap, "textbox")
local checkbox = find_node(snap, "checkbox")
local select_node = find_node(snap, "combobox")

if btn and btn.refId then
  pcall_ok("page.click", page.click, btn.refId)
  pcall_ok("page.dblclick", page.dblclick, btn.refId)
  pcall_ok("page.hover", page.hover, btn.refId)
  pcall_ok("page.unhover", page.unhover)
end

if input and input.refId then
  pcall_ok("page.fill", page.fill, input.refId, "hello")
  pcall_ok("page.type", page.type, input.refId, " world")
  pcall_ok("page.append", page.append, input.refId, "!")
  pcall_ok("page.press", page.press, "Enter")
end

if checkbox and checkbox.refId then
  pcall_ok("page.check", page.check, checkbox.refId, true)
else
  print("TEST_API_SKIP:page.check")
end

if select_node and select_node.refId then
  pcall_ok("page.select", page.select, select_node.refId, "b")
else
  print("TEST_API_SKIP:page.select")
end

-- ─── page scroll APIs ─────────────────────────────────────

pcall_ok("page.scroll", page.scroll, "down", 50)
pcall_ok("page.scroll_to", page.scroll_to, btn.refId)

-- ─── page navigation ──────────────────────────────────────

print("TEST_API_SKIP:page.back")
print("TEST_API_SKIP:page.forward")
print("TEST_API_SKIP:page.reload")

-- ─── non-functional APIs (expected errors) ────────────────

local ok_ss, msg_ss = pcall(page.screenshot)
if not ok_ss and tostring(msg_ss):find("not yet implemented") then
  ok("page.screenshot:E_NOT_IMPLEMENTED")
else
  err("page.screenshot", "expected not implemented")
end

pcall_ok("web.log", web.log, "test")

-- ─── summary ─────────────────────────────────────────────

print("TEST_ALL_APIS_DONE")
