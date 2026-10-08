import { OVERHEAD_COUNTING } from '@/services/overhead/constants';
import type { TrackedPerson } from '@/services/overhead/tracker';

export class CountSmoother {
  private history: number[] = [];

  update(count: number): number {
    this.history.push(count);
    if (this.history.length > OVERHEAD_COUNTING.smoothWindow) this.history.shift();
    const sorted = [...this.history].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    return Math.round(median);
  }

  reset() {
    this.history = [];
  }
}

export class UniqueCounter {
  private seen = new Map<number, number>();
  total = 0;

  update(people: TrackedPerson[]) {
    for (const person of people) {
      const frames = (this.seen.get(person.id) ?? 0) + 1;
      this.seen.set(person.id, frames);
      if (frames === OVERHEAD_COUNTING.uniqueMinFrames) this.total += 1;
    }
  }

  reset() {
    this.seen.clear();
    this.total = 0;
  }
}

export class StableCounter {
  private last = -1;
  private steady = 0;

  update(count: number): boolean {
    if (count === this.last) {
      this.steady = Math.min(OVERHEAD_COUNTING.stableFrames, this.steady + 1);
    } else {
      this.last = count;
      this.steady = 1;
    }
    return this.steady >= OVERHEAD_COUNTING.stableFrames;
  }

  reset() {
    this.last = -1;
    this.steady = 0;
  }
}
