local function path_join(...)
  local segments = {}
  for _, part in ipairs({...}) do
    for seg in string.gmatch(part, "([^/]+)") do
      table.insert(segments, seg)
    end
  end
  return "/" .. table.concat(segments, "/")
end
local function path_basename(p)
  return string.match(p, "([^/]+)$") or ""
end
local function path_dirname(p)
  local last_slash = nil
  local s = 1
  while s <= #p do
    local slash = string.find(p, "/", s, true)
    if slash then
      last_slash = slash
      s = slash + 1
    else
      break
    end
  end
  if last_slash then
    if last_slash == 1 then
      return "/"
    else
      return string.sub(p, 1, last_slash - 1)
    end
  end
  return "/"
end
local function path_extname(p)
  local base = path_basename(p)
  local ext = string.match(base, "%.([^%.]+)$")
  return ext and ("." .. ext) or ""
end
local function path_normalize(p)
  local segments = {}
  for seg in string.gmatch(p, "([^/]+)") do
    if seg == ".." then
      if #segments > 0 then table.remove(segments) end
    elseif seg ~= "." then
      table.insert(segments, seg)
    end
  end
  local result = "/" .. table.concat(segments, "/")
  if p:sub(-1) == "/" and #segments > 0 then result = result .. "/" end
  return result
end
local function path_is_absolute(p)
  return string.sub(p, 1, 1) == "/"
end
path = {
  join = path_join,
  basename = path_basename,
  dirname = path_dirname,
  extname = path_extname,
  normalize = path_normalize,
  is_absolute = path_is_absolute,
  sep = "/",
}
