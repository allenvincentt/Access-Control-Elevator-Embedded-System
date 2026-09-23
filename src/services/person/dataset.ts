import { Directory, File, Paths } from 'expo-file-system';

import type { ClipLabel } from '@/services/person/constants';

export const PERSON_DATASET_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_PERSON_DATASET === '1';

export type ClipFrame = {
  file: string;
  width: number;
  height: number;
  capturedAt: number;
};

export type ClipManifest = {
  version: 1;
  id: string;
  createdAt: number;
  label: ClipLabel;
  frames: ClipFrame[];
};

export type StoredClip = {
  manifest: ClipManifest;
  directory: Directory;
};

export type RecordedFrame = {
  uri: string;
  width: number;
  height: number;
  capturedAt: number;
};

const DATASET_FOLDER = 'person-dataset';
const MANIFEST_NAME = 'clip.json';

function datasetRoot(): Directory {
  const root = new Directory(Paths.document, DATASET_FOLDER);
  if (!root.exists) root.create({ intermediates: true });
  return root;
}

function writeManifest(directory: Directory, manifest: ClipManifest) {
  const file = new File(directory, MANIFEST_NAME);
  if (!file.exists) file.create();
  file.write(JSON.stringify(manifest, null, 2));
}

function readManifest(directory: Directory): ClipManifest | null {
  const file = new File(directory, MANIFEST_NAME);
  if (!file.exists) return null;
  try {
    const parsed = JSON.parse(file.textSync()) as ClipManifest;
    if (parsed?.version !== 1 || !Array.isArray(parsed.frames) || !parsed.label) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clipId(createdAt: number): string {
  return `clip-${new Date(createdAt).toISOString().replace(/[:.]/g, '-')}`;
}

function frameName(index: number): string {
  return `frame-${String(index + 1).padStart(4, '0')}.jpg`;
}

export class ClipRecorder {
  private readonly directory: Directory;
  private readonly manifest: ClipManifest;
  private closed = false;

  constructor(label: ClipLabel) {
    const createdAt = Date.now();
    const id = clipId(createdAt);
    this.directory = new Directory(datasetRoot(), id);
    this.directory.create({ intermediates: true });
    this.manifest = {
      version: 1,
      id,
      createdAt,
      label: { count: label.count, tags: [...label.tags] },
      frames: [],
    };
    writeManifest(this.directory, this.manifest);
  }

  get frameCount(): number {
    return this.manifest.frames.length;
  }

  async add(frame: RecordedFrame): Promise<void> {
    if (this.closed) throw new Error('The clip has already been saved.');
    const name = frameName(this.manifest.frames.length);
    const source = new File(frame.uri);
    await source.move(new File(this.directory, name));
    this.manifest.frames.push({
      file: name,
      width: frame.width,
      height: frame.height,
      capturedAt: frame.capturedAt,
    });
    writeManifest(this.directory, this.manifest);
  }

  finish(): StoredClip | null {
    this.closed = true;
    if (this.manifest.frames.length === 0) {
      try {
        this.directory.delete();
      } catch {
        return null;
      }
      return null;
    }
    writeManifest(this.directory, this.manifest);
    return { manifest: this.manifest, directory: this.directory };
  }
}

export function listClips(): StoredClip[] {
  const clips: StoredClip[] = [];
  for (const entry of datasetRoot().list()) {
    if (!(entry instanceof Directory)) continue;
    const manifest = readManifest(entry);
    if (manifest) clips.push({ manifest, directory: entry });
  }
  return clips.sort((a, b) => b.manifest.createdAt - a.manifest.createdAt);
}

export function relabelClip(clip: StoredClip, label: ClipLabel): StoredClip {
  const manifest: ClipManifest = {
    ...clip.manifest,
    label: { count: label.count, tags: [...label.tags] },
  };
  writeManifest(clip.directory, manifest);
  return { manifest, directory: clip.directory };
}

export function deleteClip(clip: StoredClip) {
  clip.directory.delete();
}

export function clipFrameUri(clip: StoredClip, frame: ClipFrame): string {
  return new File(clip.directory, frame.file).uri;
}

export function saveReport(markdown: string, createdAt: number): string {
  const stamp = new Date(createdAt).toISOString().replace(/[:.]/g, '-');
  const file = new File(datasetRoot(), `report-${stamp}.md`);
  if (!file.exists) file.create();
  file.write(markdown);
  return file.uri;
}
