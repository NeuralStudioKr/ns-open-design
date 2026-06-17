// Scratch directory disk-usage sampler for CloudWatch (09 P1-10 §6).
//
// In S3 storage mode the daemon keeps a transient mirror under
// $OD_SCRATCH_DIR (default $OD_DATA_DIR/scratch). If scratch grows
// unbounded (e.g. evict_after_run is off, or a large project failed to
// sync up cleanly) the EBS / instance volume fills up and the daemon
// stalls. We want a cheap recursive byte-count emitted as a structured
// JSON marker so a CW log metric filter + alarm catches the drift
// before disk-full pages.
//
// The sampler walks $OD_SCRATCH_DIR via fs.stat and sums regular-file
// sizes. Per-call cost is O(files) but the directory is bounded by the
// active project set, so a run-end emission is cheap. Symlinks and dirs
// are walked but not counted; broken paths are skipped so a partial tree
// never blocks the run.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type ScratchDiskUsageSample = {
  scratchDir: string;
  bytes: number;
  files: number;
  errors: number;
};

export async function measureScratchDiskUsage(
  scratchDir: string,
): Promise<ScratchDiskUsageSample> {
  const sample: ScratchDiskUsageSample = {
    scratchDir,
    bytes: 0,
    files: 0,
    errors: 0,
  };
  await walk(scratchDir, sample);
  return sample;
}

async function walk(root: string, sample: ScratchDiskUsageSample): Promise<void> {
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = (await fs.readdir(root, { withFileTypes: true })) as Array<{
      name: string;
      isDirectory: () => boolean;
      isFile: () => boolean;
    }>;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return;
    sample.errors += 1;
    return;
  }
  for (const entry of entries) {
    const child = path.join(root, String(entry.name));
    if (entry.isDirectory()) {
      await walk(child, sample);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stat = await fs.stat(child);
      if (stat.isFile()) {
        sample.bytes += stat.size;
        sample.files += 1;
      }
    } catch {
      sample.errors += 1;
    }
  }
}

export type ScratchDiskUsageMarker = {
  metric: 'od_scratch_disk_usage';
  stage: string;
  scratchDir: string;
  bytes: number;
  files: number;
  errors: number;
  thresholdBytes?: number;
  overThreshold?: boolean;
  projectId?: string;
  runId?: string;
};

function thresholdBytes(): number | null {
  // OD_SCRATCH_DISK_THRESHOLD_MB (default 2048 = 2 GiB) — set <=0 to
  // disable the overThreshold flag (still emits the bare sample so the
  // metric filter can keep working).
  const raw = (process.env.OD_SCRATCH_DISK_THRESHOLD_MB ?? '2048').trim();
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb <= 0) return null;
  return Math.floor(mb) * 1024 * 1024;
}

export function buildScratchDiskUsageMarker(args: {
  sample: ScratchDiskUsageSample;
  stage: string;
  projectId?: string;
  runId?: string;
}): ScratchDiskUsageMarker {
  const limit = thresholdBytes();
  const marker: ScratchDiskUsageMarker = {
    metric: 'od_scratch_disk_usage',
    stage: args.stage,
    scratchDir: args.sample.scratchDir,
    bytes: args.sample.bytes,
    files: args.sample.files,
    errors: args.sample.errors,
  };
  if (typeof args.projectId === 'string' && args.projectId) {
    marker.projectId = args.projectId;
  }
  if (typeof args.runId === 'string' && args.runId) {
    marker.runId = args.runId;
  }
  if (limit !== null) {
    marker.thresholdBytes = limit;
    marker.overThreshold = args.sample.bytes >= limit;
  }
  return marker;
}

// Gate: emit only when the operator explicitly opts in (avoid noisy
// stdout in non-Teamver standalone daemons). `OD_SCRATCH_DISK_METRICS=1`.
export function scratchDiskMetricsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.OD_SCRATCH_DISK_METRICS ?? '').trim() === '1';
}
