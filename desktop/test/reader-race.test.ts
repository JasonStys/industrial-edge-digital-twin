/**
 * @file reader-race.test.ts
 * @brief Exercise actual descriptor/path replacement and file growth with deterministic filesystem hooks.
 * @details Jason Stys; hooks wrap genuine fs operations on tiny synthetic temporary files.
 */
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type * as FileSystem from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  afterOpen: undefined as (() => void) | undefined,
  beforeRead: undefined as (() => void) | undefined,
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return {
    ...actual,
    openSync(path: FileSystem.PathLike, flags: FileSystem.OpenMode, mode?: FileSystem.Mode) {
      const descriptor = actual.openSync(path, flags, mode);
      hooks.afterOpen?.();
      return descriptor;
    },
    readSync(
      descriptor: number,
      buffer: NodeJS.ArrayBufferView,
      offset: number,
      length: number,
      position: number | null,
    ) {
      hooks.beforeRead?.();
      return actual.readSync(descriptor, buffer, offset, length, position);
    },
  };
});
import { readPrivate } from "../src/runtime.js";
const roots: string[] = [];
afterEach(() => {
  hooks.afterOpen = undefined;
  hooks.beforeRead = undefined;
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

it("rejects a genuine pathname replacement after opening before returning either file's contents", () => {
  const directory = mkdtempSync(join(tmpdir(), "twin-file-race-"));
  roots.push(directory);
  const path = join(directory, "review.json"),
    previous = join(directory, "previous.json"),
    replacement = join(directory, "replacement.json");
  writeFileSync(path, "old!");
  writeFileSync(replacement, "new!");
  let reads = 0;
  hooks.afterOpen = () => {
    hooks.afterOpen = undefined;
    renameSync(path, previous);
    renameSync(replacement, path);
  };
  hooks.beforeRead = () => {
    reads += 1;
  };
  expect(() => readPrivate(path, 4)).toThrow("identity");
  expect(reads).toBe(0);
  expect(readFileSync(previous, "utf8")).toBe("old!");
  expect(readFileSync(path, "utf8")).toBe("new!");
});

it("bounds actual bytes when a genuine file grows after descriptor metadata was accepted", () => {
  const directory = mkdtempSync(join(tmpdir(), "twin-file-growth-"));
  roots.push(directory);
  const path = join(directory, "review.json");
  writeFileSync(path, "1234");
  hooks.beforeRead = () => {
    hooks.beforeRead = undefined;
    appendFileSync(path, "5");
  };
  expect(() => readPrivate(path, 4)).toThrow("byte limit");
  expect(readFileSync(path, "utf8")).toBe("12345");
});
