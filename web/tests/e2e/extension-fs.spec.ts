import { test } from "@playwright/test";
import {
  expectCellOutputContains,
  launchExtensionContext,
  runCell,
  setCellCode,
  waitForCellStatus,
  waitForKernelReady,
} from "../extension-helpers";

test.describe("Extension fs", () => {
  test("1: fs.write_text and fs.read_text roundtrip", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);
      await setCellCode(
        popup,
        0,
        `fs.write_text("/ext_hello.txt", "hello extension")
local ok, txt = pcall(function()
  return fs.read_text("/ext_hello.txt")
end)
print("ok: " .. tostring(ok))
print("txt: " .. tostring(txt))`,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "ok: true");
      await expectCellOutputContains(popup, 0, "txt: hello extension");
    } finally {
      await context.close();
    }
  });

  test("2: fs.mkdir and fs.list", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);
      await setCellCode(
        popup,
        0,
        `fs.mkdir("/ext_dir")
fs.write_text("/ext_dir/a.txt", "a")
fs.write_text("/ext_dir/b.txt", "b")
local ok, entries = pcall(function()
  return fs.list("/ext_dir")
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
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "ok: true");
      await expectCellOutputContains(popup, 0, "count: 2");
      await expectCellOutputContains(popup, 0, "name: a.txt");
      await expectCellOutputContains(popup, 0, "name: b.txt");
    } finally {
      await context.close();
    }
  });

  test("3: fs.stat returns metadata", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);
      await setCellCode(
        popup,
        0,
        `fs.write_text("/ext_stat.txt", "12345")
local ok, meta = pcall(function()
  return fs.stat("/ext_stat.txt")
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
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "ok: true");
      await expectCellOutputContains(popup, 0, "name: ext_stat.txt");
      await expectCellOutputContains(popup, 0, "kind: File");
      await expectCellOutputContains(popup, 0, "size: 5");
    } finally {
      await context.close();
    }
  });

  test("4: path.join and path.basename", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);
      await setCellCode(
        popup,
        0,
        `local joined = path.join("/task", "report", "data.txt")
local base = path.basename("/task/report/data.txt")
local dir = path.dirname("/task/report/data.txt")
print("joined: " .. joined)
print("base: " .. base)
print("dir: " .. dir)`,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "joined: /task/report/data.txt");
      await expectCellOutputContains(popup, 0, "base: data.txt");
      await expectCellOutputContains(popup, 0, "dir: /task/report");
    } finally {
      await context.close();
    }
  });

  test("5: fs.exists and fs.delete", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);
      await setCellCode(
        popup,
        0,
        `fs.write_text("/ext_to_delete.txt", "temporary")
print("before: " .. tostring(fs.exists("/ext_to_delete.txt")))
fs.delete("/ext_to_delete.txt")
print("after: " .. tostring(fs.exists("/ext_to_delete.txt")))`,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "before: true");
      await expectCellOutputContains(popup, 0, "after: false");
    } finally {
      await context.close();
    }
  });

  test("6: fs.copy and fs.move", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);
      await setCellCode(
        popup,
        0,
        `fs.write_text("/ext_copy_src.txt", "copyme")
fs.copy("/ext_copy_src.txt", "/ext_copy_dst.txt")
local copied = fs.read_text("/ext_copy_dst.txt")
print("copied: " .. tostring(copied))
fs.write_text("/ext_move_src.txt", "moveme")
fs.move("/ext_move_src.txt", "/ext_move_dst.txt")
local moved = fs.read_text("/ext_move_dst.txt")
print("moved: " .. tostring(moved))
print("src_exists: " .. tostring(fs.exists("/ext_move_src.txt")))`,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "copied: copyme");
      await expectCellOutputContains(popup, 0, "moved: moveme");
      await expectCellOutputContains(popup, 0, "src_exists: false");
    } finally {
      await context.close();
    }
  });

  test("7: fs.write_base64 and fs.read_text", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);
      await setCellCode(
        popup,
        0,
        `fs.write_base64("/ext_b64.txt", "aGVsbG8=")
local ok, txt = pcall(function()
  return fs.read_text("/ext_b64.txt")
end)
print("decoded: " .. tostring(txt))`,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "decoded: hello");
    } finally {
      await context.close();
    }
  });

  test("8: fs.append_text extends a file", async () => {
    const { context, popup } = await launchExtensionContext();
    try {
      await waitForKernelReady(popup, 30_000);
      await popup
        .locator(".cm-content")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 });
      await popup.waitForTimeout(500);
      await setCellCode(
        popup,
        0,
        `fs.write_text("/ext_append.txt", "hello")
fs.append_text("/ext_append.txt", " world")
local txt = fs.read_text("/ext_append.txt")
print("appended: " .. tostring(txt))`,
      );
      await runCell(popup, 0);
      await waitForCellStatus(popup, 0, "success", 20_000);
      await expectCellOutputContains(popup, 0, "appended: hello world");
    } finally {
      await context.close();
    }
  });
});
