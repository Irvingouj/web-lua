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
