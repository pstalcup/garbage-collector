import { Quest } from "grimoire-kolmafia";
import {
  cliExecute,
  equippedItem,
  getProperty,
  Item,
  mallPrice,
  myClass,
  myFamiliar,
  numericModifier,
  print,
  setProperty,
  Slot,
  use,
  useFamiliar,
  useSkill,
  wait,
} from "kolmafia";
import {
  $class,
  $classes,
  $effect,
  $familiar,
  $item,
  $modifiers,
  $skill,
  AsdonMartin,
  clamp,
  Diet,
  get,
  have,
  Kmail,
  maxBy,
  set,
  unequip,
} from "libram";
import { acquire } from "../acquire";
import { withVIPClan } from "../clan";
import { globalOptions } from "../config";
import {
  acquireDietSeasoning,
  computeDayDiet,
  consumableCount,
  consumeDietEntry,
  DayDiet,
  dietAdventures,
  GarboDietEntry,
  organState,
  OrganState,
  printDiet,
  sortDietEntries,
  switchingToMayo,
  useIfUnused,
  verifyConsumption,
} from "../diet";
import { userConfirmDialog } from "../lib";
import { shrugBadEffects } from "../mood";
import { estimatedTurnsTomorrow } from "../turns";
import { GarboTask, runGarboQuests } from "./engine";
import { GarboWorkshed } from "./post/worksheds";

const MPA = get("valueOfAdventure");

let dietQuestEnabled = false;
let pillsChecked = false;
let dietPlanned = false;
let dietEffectsShrugged = false;
let simulatedDiet = false;

/**
 * Wrap a `useIfUnused` call in a task, so that the "have we already used this"
 * check happens lazily when the engine considers the task.
 * @param item the item to use
 * @param prop either a preference name, or a function returning whether we're done
 * @param maxPrice the most we're willing to pay for the item
 * @returns a task that uses the item if we haven't already
 */
function useIfUnusedTask(
  item: Item,
  prop: string | (() => boolean),
  maxPrice: () => number,
): GarboTask {
  const completed = () =>
    typeof prop === "string" ? get(prop, false) : prop();
  return {
    name: item.name,
    completed,
    do: () => useIfUnused(item, completed(), maxPrice()),
    spendsTurn: false,
    limit: { skip: 1 },
  };
}

const CHOCOLATES = new Map([
  [$class`Seal Clubber`, $item`chocolate seal-clubbing club`],
  [$class`Turtle Tamer`, $item`chocolate turtle totem`],
  [$class`Pastamancer`, $item`chocolate pasta spoon`],
  [$class`Sauceror`, $item`chocolate saucepan`],
  [$class`Accordion Thief`, $item`chocolate stolen accordion`],
  [$class`Disco Bandit`, $item`chocolate disco ball`],
]);

const NonOrganAdventureTasks: GarboTask[] = [
  useIfUnusedTask(
    $item`fancy chocolate car`,
    () => get("_chocolatesUsed") !== 0,
    () => 2 * MPA,
  ),
  {
    name: $item`LOV Extraterrestrial Chocolate`.name,
    completed: () => get("_loveChocolatesUsed") >= 3,
    do: () => {
      while (get("_loveChocolatesUsed") < 3) {
        const price = have($item`LOV Extraterrestrial Chocolate`)
          ? 15000
          : 20000;
        const value =
          clamp(3 - get("_loveChocolatesUsed"), 0, 3) * get("valueOfAdventure");
        if (value < price) break;
        if (!have($item`LOV Extraterrestrial Chocolate`)) {
          Kmail.send(
            "sellbot",
            `${$item`LOV Extraterrestrial Chocolate`.name} (1)`,
            undefined,
            20000,
          );
          wait(11);
          cliExecute("refresh inventory");
          if (!have($item`LOV Extraterrestrial Chocolate`)) {
            print(
              "I'm tired of waiting for sellbot to send me some chocolate",
              "red",
            );
            break;
          }
        }
        use($item`LOV Extraterrestrial Chocolate`);
      }
    },
    spendsTurn: false,
    limit: { skip: 1 },
  },
  {
    name: "Class Chocolates",
    completed: () => get("_chocolatesUsed") >= 3,
    do: () => {
      const classChoco = CHOCOLATES.get(myClass());
      const chocExpVal = (remaining: number, item: Item): number => {
        const advs = [0, 0, 1, 2, 3][remaining + (item === classChoco ? 1 : 0)];
        return advs * MPA - mallPrice(item);
      };
      const chocosRemaining = clamp(3 - get("_chocolatesUsed"), 0, 3);
      for (let i = chocosRemaining; i > 0; i--) {
        const chocoVals = [...CHOCOLATES.values()].map((choc) => {
          return {
            choco: choc,
            value: chocExpVal(i, choc),
          };
        });
        const best = maxBy(chocoVals, "value");
        if (best.value > 0) {
          acquire(1, best.choco, best.value + mallPrice(best.choco), false);
          use(1, best.choco);
        } else break;
      }
    },
    spendsTurn: false,
    limit: { skip: 1 },
  },
  useIfUnusedTask(
    $item`fancy chocolate sculpture`,
    () => get("_chocolateSculpturesUsed") > 0,
    () => 5 * MPA + 5000,
  ),
  useIfUnusedTask($item`essential tofu`, "_essentialTofuUsed", () => 5 * MPA),
  {
    name: $item`etched hourglass`.name,
    ready: () => have($item`etched hourglass`),
    completed: () => get("_etchedHourglassUsed"),
    do: () => use(1, $item`etched hourglass`),
    spendsTurn: false,
    limit: { skip: 1 },
  },
  {
    name: $item`time's arrow`.name,
    ready: () => mallPrice($item`time's arrow`) < 5 * MPA,
    completed: () => getProperty("_timesArrowUsed") === "true",
    do: () => {
      acquire(1, $item`time's arrow`, 5 * MPA);
      cliExecute("csend 1 time's arrow to botticelli");
      setProperty("_timesArrowUsed", "true");
    },
    spendsTurn: false,
    limit: { skip: 1 },
  },
  {
    name: $skill`Ancestral Recall`.name,
    ready: () =>
      have($skill`Ancestral Recall`) && mallPrice($item`blue mana`) < 3 * MPA,
    completed: () => get("_ancestralRecallCasts") >= 10,
    do: () => {
      const casts = Math.max(10 - get("_ancestralRecallCasts"), 0);
      acquire(casts, $item`blue mana`, 3 * MPA);
      useSkill(casts, $skill`Ancestral Recall`);
    },
    spendsTurn: false,
    limit: { skip: 1 },
  },
  {
    ...useIfUnusedTask(
      $item`borrowed time`,
      "_borrowedTimeUsed",
      () => 20 * MPA,
    ),
    ready: () => globalOptions.ascend,
  },
  {
    name: $item`extra time`.name,
    completed: () => get("_extraTimeUsed", 3) >= 3,
    do: () => {
      const extraTimeValue = (timesUsed: number): number => {
        const advs = [5, 3, 1][timesUsed];
        return advs * MPA;
      };
      for (let i = get("_extraTimeUsed", 3); i < 3; i++) {
        if (extraTimeValue(i) > mallPrice($item`extra time`)) {
          if (acquire(1, $item`extra time`, extraTimeValue(i), false)) {
            use($item`extra time`);
          }
        } else break;
      }
    },
    spendsTurn: false,
    limit: { skip: 1 },
  },
  {
    name: $item`clock`.name,
    completed: () => get("_clocksUsed", 2) >= 2,
    do: () => {
      const clockValue = (timesUsed: number): number => {
        const advs = [3, 2][timesUsed];
        return advs * MPA;
      };
      for (let i = get("_clocksUsed", 2); i < 2; i++) {
        if (clockValue(i) > mallPrice($item`clock`)) {
          if (acquire(1, $item`clock`, clockValue(i), false)) {
            use($item`clock`);
          }
        } else break;
      }
    },
    spendsTurn: false,
    limit: { skip: 1 },
  },
];

export const NonOrganAdventuresQuest: Quest<GarboTask> = {
  name: "Non-Organ Adventures",
  // These never run while simulating; we only want to know what we'd eat.
  completed: () => globalOptions.simdiet,
  tasks: NonOrganAdventureTasks,
};

const ORGAN_MODIFIERS = $modifiers`Stomach Capacity, Liver Capacity, Spleen Capacity`;

function organCapacitySlots(): Slot[] {
  return Slot.all().filter((slot) =>
    ORGAN_MODIFIERS.some((modifier) =>
      numericModifier(equippedItem(slot), modifier),
    ),
  );
}

const DietPrepTasks: GarboTask[] = [
  // Strip organ capacity enhancers to avoid accidental overfilling. These live at
  // the top of the list so they're re-checked before every other diet task.
  {
    name: "Unequip Stooper",
    completed: () => myFamiliar() !== $familiar`Stooper`,
    do: () => useFamiliar($familiar.none),
    spendsTurn: false,
    limit: { tries: 5 },
  },
  {
    name: "Unequip Organ Capacity Gear",
    completed: () => organCapacitySlots().length === 0,
    do: () => organCapacitySlots().forEach((slot) => unequip(slot)),
    spendsTurn: false,
    limit: { tries: 5 },
  },
  // The six-pack puts astral pilsners on the menu, so it has to land before
  // anything triggers planning -- the balanced menu is computed once and cached,
  // and whatever is in our inventory at that moment is what we get to eat.
  {
    name: $item`astral six-pack`.name,
    completed: () => !have($item`astral six-pack`),
    do: () => use($item`astral six-pack`),
    spendsTurn: false,
  },
  {
    name: "Barrel Prayer",
    ready: () =>
      get("barrelShrineUnlocked") &&
      $classes`Turtle Tamer, Accordion Thief`.includes(myClass()),
    completed: () => get("_barrelPrayer"),
    do: () => cliExecute("barrelprayer buff"),
    spendsTurn: false,
  },
  {
    name: "Simulate Diet",
    ready: () => globalOptions.simdiet,
    completed: () => simulatedDiet,
    do: () => {
      const { shotglass, main, reserved } = dayDiet();
      print("===== SIMULATED DIET =====");
      printDiet(shotglass, "SHOTGLASS");
      printDiet(main, "FULL");
      printDiet(reserved, "RESERVED");
      simulatedDiet = true;
    },
    spendsTurn: false,
  },
  {
    name: "Switch to Mayo Clinic",
    ready: () => !globalOptions.simdiet,
    completed: () => !switchingToMayo(),
    do: () => {
      if (
        GarboWorkshed.current?.workshed === $item`Asdon Martin keyfob (on ring)`
      ) {
        // potionMenu already prices food potions as though the Mayo Clinic is
        // installed whenever switchingToMayo() holds, so the cached plan is
        // the right one to size this drive against.
        AsdonMartin.drive(
          $effect`Driving Observantly`,
          dietAdventures(dayDiet().main) +
            (globalOptions.ascend ? 0 : estimatedTurnsTomorrow),
        );
      } else {
        GarboWorkshed.current?.action?.();
      }

      if (GarboWorkshed.useNext()?.workshed !== $item`portable Mayo Clinic`) {
        throw new Error("Failed to switch to portable Mayo clinic");
      }
    },
    spendsTurn: false,
  },
  {
    name: "Pill Check",
    ready: () => !globalOptions.simdiet,
    completed: () => pillsChecked,
    do: () => {
      for (const [pref, pill] of [
        ["_distentionPillUsed", $item`distention pill`],
        ["_syntheticDogHairPillUsed", $item`synthetic dog hair pill`],
      ] as const) {
        if (get(pref)) continue;
        if (!get("garbo_skipPillCheck", false) && !have(pill, 1)) {
          set(
            "garbo_skipPillCheck",
            userConfirmDialog(
              `You do not have any ${pill.plural}. Continue anyway? (Defaulting to no in 15 seconds)`,
              false,
              15000,
            ),
          );
        }
      }
      pillsChecked = true;
    },
    spendsTurn: false,
  },
];

export const DietPrepQuest: Quest<GarboTask> = {
  name: "Diet Prep",
  tasks: DietPrepTasks,
};

let dayPlan: DayDiet | null = null;

/**
 * The day's diet, planned at most once per run. Every consumption task shares
 * these entries and decrements them as it eats, so an entry that doesn't fit
 * yet simply stays pending until organ space opens up.
 *
 * Must not be called until the diet prep tasks have run -- the plan depends on
 * our organ capacity and on whether the Mayo Clinic is installed.
 * @returns the shared, mutable plan for today
 */
function dayDiet(): DayDiet {
  if (!dayPlan) {
    const { shotglass, main, reserved } = computeDayDiet();
    dayPlan = {
      shotglass: sortDietEntries(shotglass),
      main: sortDietEntries(main),
      reserved: sortDietEntries(reserved),
    };
  }
  return dayPlan;
}

/** Everything we still intend to eat today, in consumption order. */
function pendingEntries(): GarboDietEntry[] {
  const { shotglass, main, reserved } = dayDiet();
  return [...shotglass.entries, ...main.entries, ...reserved.entries].filter(
    (entry) => entry.quantity > 0,
  );
}

/**
 * Name a diet entry for the engine log, disambiguating repeats.
 * Grimoire keys tasks by name, so these have to be unique within the quest.
 * @param entry the entry to name
 * @param seen counts of names used so far, mutated
 * @returns a unique, human-readable task name
 */
function dietEntryName(entry: GarboDietEntry, seen: Map<string, number>) {
  const target = entry.target();
  const base = `${target.item.name}${target.data ? ` (${target.data})` : ""}`;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base} #${count + 1}`;
}

/**
 * Turn one line of the plan into a task.
 *
 * The engine's "first available task wins" loop takes the place of
 * consumeDiet's round-robin. An entry is ready exactly when there's room for
 * it, so an organ cleaner sits unready until there's something to clean and
 * then fires ahead of the entries that were waiting on the space it frees --
 * which is why list order has to stay the sorted order.
 *
 * Each task snapshots our organs in `prepare` and checks in `post` that the
 * consumption actually moved them as planned, so a silent failure surfaces on
 * the item that caused it.
 * @param entry the plan line to consume
 * @param name unique task name
 * @param reserved whether this entry is waiting on space we don't have yet
 * @returns the task
 */
function dietEntryTask(
  entry: GarboDietEntry,
  name: string,
  reserved: boolean,
): GarboTask {
  let before: OrganState | null = null;
  let consuming = 0;
  return {
    name,
    // Reserved entries are sized for the one-point-at-a-time openings that
    // Pantsgiving and sweatpants hand back, so they must not eat space the
    // main plan is still waiting on.
    ready: () =>
      consumableCount(entry) > 0 &&
      (!reserved ||
        !dayDiet().main.entries.some((e) => consumableCount(e) > 0)),
    completed: () => entry.quantity <= 0,
    prepare: () => {
      before = organState();
      consuming = consumableCount(entry);
    },
    do: () => consumeDietEntry(entry, consuming),
    post: () => {
      if (before) verifyConsumption(entry, consuming, before);
      before = null;
    },
    spendsTurn: false,
  };
}

/**
 * The diet we actually eat. Generated from the day's plan, so this must not be
 * built until the prep tasks have run.
 * @returns the consumption quest for today's diet
 */
export function DietConsumptionQuest(): Quest<GarboTask> {
  // Only yields tasks once runDiet has taken responsibility for the day's
  // diet. Without this, splicing the quest into the barf loop would plan and
  // eat a whole diet on paths that deliberately skipped one (--nodiet, or a
  // yachtzee chain that owns its own consumption).
  if (!dietQuestEnabled || globalOptions.nodiet || globalOptions.simdiet) {
    return { name: "Diet", completed: () => true, tasks: [] };
  }

  const { shotglass, main, reserved } = dayDiet();
  const seen = new Map<string, number>();
  const tasks = [
    // Shotglass first: whichever size-1 booze is drunk first claims the free
    // slot, so it has to be the one we planned for it.
    ...shotglass.entries.map((entry) =>
      dietEntryTask(entry, dietEntryName(entry, seen), false),
    ),
    ...main.entries.map((entry) =>
      dietEntryTask(entry, dietEntryName(entry, seen), false),
    ),
    ...reserved.entries.map((entry) =>
      dietEntryTask(entry, dietEntryName(entry, seen), true),
    ),
  ];

  return {
    name: "Diet",
    tasks: [
      {
        name: "Plan Diet",
        completed: () => dietPlanned,
        do: () => {
          print();
          printDiet(shotglass, "SHOTGLASS");
          printDiet(main, "FULL");
          printDiet(reserved, "RESERVED");
          print();
          for (const diet of [shotglass, main, reserved]) {
            acquireDietSeasoning(diet);
          }
          dietPlanned = true;
        },
        spendsTurn: false,
      },
      ...tasks,
      {
        name: "Shrug Bad Effects",
        // Fires once there's nothing left we can eat right now. Waiting for the
        // plan to be empty would never happen -- reserved entries are supposed
        // to still be pending, waiting on space we haven't been handed yet.
        ready: () => !pendingEntries().some((e) => consumableCount(e) > 0),
        completed: () => dietEffectsShrugged,
        do: () => {
          shrugBadEffects();
          dietEffectsShrugged = true;
        },
        spendsTurn: false,
      },
    ],
  };
}

export function nonOrganAdventures(): void {
  runGarboQuests([NonOrganAdventuresQuest]);
}

export function runDiet(): void {
  withVIPClan(() => {
    // Prep first: the plan depends on our organ capacity and workshed, so the
    // consumption quest can't be generated until these have run.
    runGarboQuests([DietPrepQuest, NonOrganAdventuresQuest]);
    if (globalOptions.simdiet || globalOptions.nodiet) return;

    dietQuestEnabled = true;
    runGarboQuests([DietPrepQuest, DietConsumptionQuest()]);

    // Reserved entries are meant to still be pending -- they're waiting on
    // stomach and liver we haven't been handed yet. Anything we had room for
    // and still didn't eat is a real failure.
    const stuck = pendingEntries().filter(
      (entry) => consumableCount(entry) > 0,
    );
    if (stuck.length > 0) {
      print();
      printDiet(new Diet(stuck), "REMAINING");
      print();
      throw "Failed to consume some diet item.";
    }
  });
  globalOptions.dietCompleted = true;
}
