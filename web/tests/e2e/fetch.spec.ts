import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  getCell,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../helpers";

test.describe("web.fetch", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: web.fetch returns response from mock API", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
  return web.fetch("https://httpbin.org/json")
end)
if ok then
  print("Status: " .. result.status)
  local data = json.decode(result.body)
  print("Has slideshow: " .. tostring(data.slideshow ~= nil))
  print("Has title: " .. tostring(data.slideshow.title ~= nil))
else
  print("Fetch error: " .. tostring(result))
end`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    const output = getCell(page, 0).locator('[data-testid="cell-output"]');
    await output.waitFor({ state: "visible" });
  });

  test("2: web.fetch handles HTTP 404", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
  return web.fetch("https://httpbin.org/status/404")
end)
if ok then
  print("Status: " .. result.status)
else
  print("Error: " .. tostring(result))
end`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
  });

  test("3: web.fetch handles network error with pcall", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
  return web.fetch("https://0.0.0.0:1/impossible", { timeout = 1000 })
end)
print("pcall ok: " .. tostring(ok))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "pcall ok:");
  });

  test("4: web.fetch with POST method", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
  return web.fetch("https://httpbin.org/post", {
    method = "POST",
    body = '{"hello":"world"}',
    headers = { ["Content-Type"] = "application/json" }
  })
end)
if ok then
  print("Status: " .. result.status)
else
  print("Error: " .. tostring(result))
end`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
  });

  test("5: multiple fetch calls in one cell", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local urls = {
  "https://httpbin.org/get",
  "https://httpbin.org/ip"
}
for i, url in ipairs(urls) do
  local ok, result = pcall(function()
    return web.fetch(url)
  end)
  if ok then
    print("Fetch " .. i .. ": " .. result.status)
  else
    print("Fetch " .. i .. " error")
  end
end`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
  });
});

test.describe("web.fetch_dom", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: web.fetch_dom returns matches from HTML", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
  return web.fetch_dom("https://httpbin.org/html", "h1")
end)
if ok then
  print("Status: " .. result.status)
  print("Matches: " .. #result.matches)
  if #result.matches > 0 then
    print("Tag: " .. result.matches[1].tag)
    print("Has text: " .. tostring(result.matches[1].text ~= nil))
  end
else
  print("Error: " .. tostring(result))
end`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Matches:");
  });

  test("2: web.fetch_dom with no selector returns empty matches", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
  return web.fetch_dom("https://httpbin.org/html")
end)
if ok then
  print("Status: " .. result.status)
  print("Matches: " .. #result.matches)
else
  print("Error: " .. tostring(result))
end`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Matches: 0");
  });

  test("3: web.fetch_dom with max_text truncates", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local ok, result = pcall(function()
  return web.fetch_dom("https://httpbin.org/html", "h1", 5)
end)
if ok then
  if #result.matches > 0 then
    print("Text length: " .. string.len(result.matches[1].text))
  end
else
  print("Error: " .. tostring(result))
end`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "Text length: 5");
  });
});
