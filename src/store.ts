import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Interview } from './interview.js';

export class InterviewStore {
  private readonly interviews = new Map<string, Interview>();

  constructor(private readonly file: string) {
    this.load();
  }

  get(key: string): Interview | undefined {
    return this.interviews.get(key);
  }

  set(interview: Interview): void {
    this.interviews.set(interview.key, interview);
    this.persist();
  }

  findActiveByUser(userId: string): Interview | undefined {
    for (const interview of this.interviews.values()) {
      if (interview.userId === userId && interview.status === 'active') return interview;
    }
    return undefined;
  }

  private load(): void {
    if (!existsSync(this.file)) return;

    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Interview[];
      for (const interview of parsed) {
        this.interviews.set(interview.key, interview);
      }
    } catch (err) {
      console.warn(`could not read ${this.file}, starting empty:`, err);
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify([...this.interviews.values()], null, 2));
      renameSync(tmp, this.file);
    } catch (err) {
      // an unwritable data dir (a ro mount, a uid the container can't write as) must not take
      // down an interview that is already running in memory — the snapshot is only for restarts
      console.error(`could not write ${this.file}, interviews continue in memory:`, err);
    }
  }
}
