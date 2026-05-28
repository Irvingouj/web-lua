local function tab_current()
  local tabs = chrome.tabs.query({active = true, currentWindow = true})
  if tabs and tabs[1] then
    return tabs[1].id
  end
  return nil
end
local function tab_url(tab_id)
  local id = tab_id or tab_current()
  if not id then return nil end
  local t = chrome.tabs.get(id)
  return t and t.url
end
local function tab_title(tab_id)
  local id = tab_id or tab_current()
  if not id then return nil end
  local t = chrome.tabs.get(id)
  return t and t.title
end
tab = {
  query = web.tab.query,
  create = web.tab.create,
  activate = web.tab.activate,
  close = web.tab.close,
  execute_script = web.tab.execute_script,
  click = web.tab.click,
  fill = web.tab.fill,
  snapshot = web.tab.snapshot,
  snapshot_text = web.tab.snapshot_text,
  snapshot_data = web.tab.snapshot_data,
  scroll_to = web.tab.scroll_to,
  evaluate = web.tab.evaluate,
  back = web.tab.back,
  wait_for_load = web.tab.wait_for_load,
  fetch = web.tab.fetch,
  open = function(url)
    local t = chrome.tabs.create({url = url or ""})
    return t and t.id
  end,
  current = tab_current,
  focus = function(tab_id)
    local id = tab_id or tab_current()
    if id then
      chrome.tabs.update(id, {active = true})
    end
    return id
  end,
  url = tab_url,
  title = tab_title,
  reload = function(tab_id)
    local id = tab_id or tab_current()
    if id then
      chrome.tabs.reload(id)
    end
    return id
  end,
}
runtime = {
  fetch = web.fetch,
  sleep = web.sleep,
  storage = web.storage,
  clipboard = web.clipboard,
  notifications = web.notifications,
}
page.go = page["goto"]
page.open = page.new_tab
page.see = page.snapshot
page.enter = function() return page.press("Enter") end
page.wait_for_load = function(timeout)
  return tab.wait_for_load(tab.current(), timeout)
end
page.fetch = function(url, opts)
  return tab.fetch(tab.current(), url, opts)
end
tab.sleep = runtime.sleep
