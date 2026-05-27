import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../helpers";

test.describe("fs and path", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForKernelReady(page);
  });

  test("1: fs.write_text and fs.read_text roundtrip", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `fs.write_text("/test_hello.txt", "hello world")
local ok, txt = pcall(function()
  return fs.read_text("/test_hello.txt")
end)
print("ok: " .. tostring(ok))
print("txt: " .. tostring(txt))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "ok: true");
    await expectCellOutputContains(page, 0, "txt: hello world");
  });

  test("2: fs.mkdir and fs.list", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `fs.mkdir("/test_dir")
fs.write_text("/test_dir/a.txt", "a")
fs.write_text("/test_dir/b.txt", "b")
local ok, entries = pcall(function()
  return fs.list("/test_dir")
end)
print("ok: " .. tostring(ok))
if type(entries) == "table" then
  print("count: " .. tostring(#entries))
  for _, e in ipairs(entries) do
    print("name: " .. tostring(e.name))
  end
else
  print("entries: " .. tostring(entries))
end`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "ok: true");
    await expectCellOutputContains(page, 0, "count: 2");
    await expectCellOutputContains(page, 0, "name: a.txt");
    await expectCellOutputContains(page, 0, "name: b.txt");
  });

  test("3: fs.stat returns metadata", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `fs.write_text("/stat_check.txt", "12345")
local ok, meta = pcall(function()
  return fs.stat("/stat_check.txt")
end)
print("ok: " .. tostring(ok))
if type(meta) == "table" then
  print("name: " .. tostring(meta.name))
  print("kind: " .. tostring(meta.kind))
  print("size: " .. tostring(meta.size))
else
  print("meta: " .. tostring(meta))
end`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "ok: true");
    await expectCellOutputContains(page, 0, "name: stat_check.txt");
    await expectCellOutputContains(page, 0, "kind: File");
    await expectCellOutputContains(page, 0, "size: 5");
  });

  test("4: path.join and path.basename", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `local joined = path.join("/task", "report", "data.txt")
local base = path.basename("/task/report/data.txt")
local dir = path.dirname("/task/report/data.txt")
print("joined: " .. joined)
print("base: " .. base)
print("dir: " .. dir)`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "joined: /task/report/data.txt");
    await expectCellOutputContains(page, 0, "base: data.txt");
    await expectCellOutputContains(page, 0, "dir: /task/report");
  });

  test("5: fs.exists and fs.delete", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `fs.write_text("/to_delete.txt", "temporary")
print("before: " .. tostring(fs.exists("/to_delete.txt")))
fs.delete("/to_delete.txt")
print("after: " .. tostring(fs.exists("/to_delete.txt")))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "before: true");
    await expectCellOutputContains(page, 0, "after: false");
  });

  test("6: fs.copy and fs.move", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `fs.write_text("/copy_src.txt", "copyme")
fs.copy("/copy_src.txt", "/copy_dst.txt")
local copied = fs.read_text("/copy_dst.txt")
print("copied: " .. tostring(copied))
fs.write_text("/move_src.txt", "moveme")
fs.move("/move_src.txt", "/move_dst.txt")
local moved = fs.read_text("/move_dst.txt")
print("moved: " .. tostring(moved))
print("src_exists: " .. tostring(fs.exists("/move_src.txt")))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "copied: copyme");
    await expectCellOutputContains(page, 0, "moved: moveme");
    await expectCellOutputContains(page, 0, "src_exists: false");
  });

  test("7: fs.write_base64 and fs.read_base64", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `fs.write_base64("/b64.txt", "aGVsbG8=")
local ok, txt = pcall(function()
  return fs.read_text("/b64.txt")
end)
print("decoded: " .. tostring(txt))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "decoded: hello");
  });

  test("8: fs.append_text extends a file", async ({ page }) => {
    await setCellCode(
      page,
      0,
      `fs.write_text("/append.txt", "hello")
fs.append_text("/append.txt", " world")
local txt = fs.read_text("/append.txt")
print("appended: " .. tostring(txt))`,
    );
    await runCell(page, 0);
    await waitForCellStatus(page, 0, "success");
    await expectCellOutputContains(page, 0, "appended: hello world");
  });
});
