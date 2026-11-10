/**
 * @file repository-reader.test.mjs
 * @brief Exercises real temporary-file byte bounds, descriptor identity and concurrent growth.
 * @details Exact test/helper variable locations are in docs/generated/symbol-index.md.
 */

import assert from "node:assert/strict";
import { appendFile, mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { POLICY_TEXT_LIMIT, readBoundedHandle, readPolicyText } from "./repository-reader.mjs";

/** Own an unrelated private temporary directory and remove only that exact directory. */
async function fixture(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "twin-policy-reader-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("empty and multibyte UTF-8 text are preserved without modifying source bytes", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "source.txt");
    await writeFile(file, "");
    assert.equal(await readPolicyText(file), "");
    const original = "voltage µV\n温度";
    await writeFile(file, original);
    assert.equal(await readPolicyText(file), original);
    assert.equal(await readFile(file, "utf8"), original);
  });
});

test("the exact byte boundary is included and an extra byte is excluded", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "boundary.txt");
    await writeFile(file, "x".repeat(POLICY_TEXT_LIMIT));
    assert.equal((await readPolicyText(file)).length, POLICY_TEXT_LIMIT);
    await appendFile(file, "x");
    assert.equal(await readPolicyText(file), null);
    await writeFile(file, "µ");
    assert.equal(await readPolicyText(file, 1), null);
    assert.equal(await readPolicyText(file, 2), "µ");
  });
});

test("an open descriptor keeps its source after the pathname is replaced", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "source.txt");
    const moved = path.join(directory, "original.txt");
    const replacement = path.join(directory, "replacement.txt");
    await writeFile(file, "original descriptor");
    await writeFile(replacement, "replacement pathname", { flag: "wx" });
    await assert.rejects(writeFile(replacement, "must not clobber", { flag: "wx" }), {
      code: "EEXIST",
    });
    const handle = await open(file, "r");
    try {
      await rename(file, moved);
      await rename(replacement, file);
      assert.equal(await readBoundedHandle(handle), "original descriptor");
      assert.equal(await readPolicyText(file), "replacement pathname");
    } finally {
      await handle.close();
    }
  });
});

test("actual growth between fstat and read cannot bypass the byte cap", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "growing.txt");
    await writeFile(file, "small");
    const handle = await open(file, "r+");
    let observedSize = 0;
    let bytesRequested = 0;
    try {
      // Interleave a real filesystem append after actual fstat, before the first actual read.
      const interleaved = {
        async stat() {
          const info = await handle.stat();
          observedSize = info.size;
          await handle.write("x".repeat(64), info.size, "utf8");
          return info;
        },
        async read(buffer, offset, length, position) {
          bytesRequested += length;
          return await handle.read(buffer, offset, length, position);
        },
      };
      assert.equal(await readBoundedHandle(interleaved, 32), null);
      assert.equal(observedSize, 5);
      assert.equal(bytesRequested, 33);
      assert.equal((await handle.stat()).size, 69);
    } finally {
      await handle.close();
    }
  });
});

test("partial reads continue from explicit offsets rather than truncating evidence", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "partial.txt");
    await writeFile(file, "abcdef");
    const handle = await open(file, "r");
    const positions = [];
    try {
      const chunked = {
        stat: () => handle.stat(),
        read(buffer, offset, length, position) {
          positions.push(position);
          return handle.read(buffer, offset, Math.min(length, 2), position);
        },
      };
      assert.equal(await readBoundedHandle(chunked, 6), "abcdef");
      assert.deepEqual(positions, [0, 2, 4, 6]);
    } finally {
      await handle.close();
    }
  });
});

test("missing files, nonregular inputs and read errors fail instead of empty evidence", async () => {
  await fixture(async (directory) => {
    await assert.rejects(readPolicyText(path.join(directory, "missing.txt")), { code: "ENOENT" });
    await assert.rejects(readPolicyText(directory));
    const file = path.join(directory, "closed.txt");
    await writeFile(file, "source");
    const handle = await open(file, "r");
    await handle.close();
    await assert.rejects(readBoundedHandle(handle), { code: "EBADF" });
    const interrupted = await open(path.join(directory, "interrupted.txt"), "wx+");
    await interrupted.write("real source");
    const closedBeforeRead = {
      async stat() {
        const info = await interrupted.stat();
        await interrupted.close();
        return info;
      },
      read: (...args) => interrupted.read(...args),
    };
    await assert.rejects(readBoundedHandle(closedBeforeRead), { code: "EBADF" });
  });
});

test("invalid budgets reject before reading file content", async () => {
  await fixture(async (directory) => {
    const file = path.join(directory, "limits.txt");
    await writeFile(file, "source");
    for (const invalid of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      POLICY_TEXT_LIMIT + 1,
    ]) {
      await assert.rejects(readPolicyText(file, invalid), RangeError);
    }
    assert.equal(await readPolicyText(file), "source");
  });
});
