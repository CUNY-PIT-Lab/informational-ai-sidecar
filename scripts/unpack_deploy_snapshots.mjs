#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "fflate";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOTS = path.join(ROOT, "replica-snapshots");
const BUNDLE = path.join(ROOT, "replica-snapshots.raw.tar.xz");
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, "replica-manifest.json"), "utf8"));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotsAreCurrent() {
  if (!existsSync(SNAPSHOTS)) return false;
  return MANIFEST.pages.every(page => {
    const filename = path.join(ROOT, page.file);
    if (!existsSync(filename)) return false;
    const compressed = readFileSync(filename);
    return compressed.length === page.snapshot_bytes
      && sha256(compressed) === page.snapshot_sha256;
  });
}

if (!snapshotsAreCurrent()) {
  if (!existsSync(BUNDLE)) {
    throw new Error("The reviewed Railway snapshot bundle is missing.");
  }
  rmSync(SNAPSHOTS, { recursive: true, force: true });
  mkdirSync(SNAPSHOTS, { recursive: true });
  execFileSync("tar", ["-xJf", BUNDLE, "-C", ROOT]);

  for (const filename of readdirSync(SNAPSHOTS)) {
    if (!filename.endsWith(".html")) continue;
    const source = path.join(SNAPSHOTS, filename);
    const compressed = Buffer.from(gzipSync(readFileSync(source), { level: 9, mtime: 0 }));
    writeFileSync(`${source}.gz`, compressed);
    rmSync(source);
  }

  if (!snapshotsAreCurrent()) {
    throw new Error("The Railway snapshot bundle did not reproduce the reviewed manifest.");
  }
  console.log(`restored ${MANIFEST.route_count} verified replica snapshots`);
}
