import { Engine, EngineOptions, StrictCombatTask } from "grimoire-kolmafia";
import { safeInterrupt } from "../lib";
import wanderer from "../wanderer";

export type GarboTask = StrictCombatTask & { sobriety?: "drunk" | "sober" };

/** A base engine for Garbo!
 * Runs extra logic before executing all tasks.
 */
export class BaseGarboEngine extends Engine<never, GarboTask> {
  // Check for interrupt before executing a task
  execute(task: GarboTask): void {
    safeInterrupt();
    super.execute(task);
    wanderer.clear();
  }
}

const SAFE_OPTIONS = new EngineOptions();
SAFE_OPTIONS.default_task_options = { limit: { skip: 1 } };

/**
 * A safe engine for Garbo!
 * Treats soft limits as tasks that should be skipped, with a default max of one attempt for any task.
 */
export class SafeGarboEngine extends BaseGarboEngine {
  options = SAFE_OPTIONS;
}

export function runSafeGarboTasks(tasks: GarboTask[]): void {
  const engine = new SafeGarboEngine(tasks);

  try {
    engine.run();
  } finally {
    engine.destruct();
  }
}

export function runGarboTasks(tasks: GarboTask[]): void {
  const engine = new BaseGarboEngine(tasks);

  try {
    engine.run();
  } finally {
    engine.destruct();
  }
}
