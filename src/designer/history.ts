/** Bounded immutable authoring history; no frame-time state or runtime resources. */
export class DesignHistory<T> {
  private entries: string[] = [];
  private cursor = -1;
  constructor(private readonly limit = 60) {}
  push(value: T): void {
    const text = JSON.stringify(value);
    if (this.entries[this.cursor] === text) return;
    this.entries.splice(this.cursor + 1);
    this.entries.push(text);
    if (this.entries.length > this.limit) this.entries.shift();
    this.cursor = this.entries.length - 1;
  }
  get canUndo(): boolean {
    return this.cursor > 0;
  }
  get canRedo(): boolean {
    return this.cursor < this.entries.length - 1;
  }
  undo(): T | undefined {
    return this.canUndo ? (JSON.parse(this.entries[--this.cursor]) as T) : undefined;
  }
  redo(): T | undefined {
    return this.canRedo ? (JSON.parse(this.entries[++this.cursor]) as T) : undefined;
  }
}
