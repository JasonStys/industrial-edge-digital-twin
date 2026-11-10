/**
 * @file repository-reader.mjs
 * @brief Reads policy-scan text from one descriptor with a hard byte budget.
 * @details Functions and variables have current line locations in docs/generated/symbol-index.md.
 */

import { Buffer } from "node:buffer";
import { open } from "node:fs/promises";

export const POLICY_TEXT_LIMIT = 2_000_000;

/**
 * Read one already-open regular file, returning null when its bytes exceed the limit.
 * The caller owns handle closure. Reads use explicit positions and at most limit+1 bytes;
 * replacement of the pathname and growth after fstat cannot expand this read budget.
 * This is a bounded read, not a snapshot of concurrent writes to the same inode.
 */
export async function readBoundedHandle(handle, limit = POLICY_TEXT_LIMIT) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > POLICY_TEXT_LIMIT) {
    throw new RangeError("Policy text limit must be an integer within the supported byte budget");
  }
  const info = await handle.stat();
  if (!info.isFile()) throw new TypeError("Policy text input must be a regular file");
  if (info.size > limit) return null;

  const buffer = Buffer.alloc(limit + 1);
  let total = 0;
  while (total < buffer.length) {
    const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
    if (bytesRead === 0) break;
    total += bytesRead;
  }
  return total > limit ? null : buffer.subarray(0, total).toString("utf8");
}

/** Open once, inspect/read that descriptor and always close it; propagate I/O failures. */
export async function readPolicyText(file, limit = POLICY_TEXT_LIMIT) {
  const handle = await open(file, "r");
  try {
    return await readBoundedHandle(handle, limit);
  } finally {
    await handle.close();
  }
}
