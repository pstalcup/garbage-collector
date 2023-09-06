import { Item, Location, myTotalTurnsSpent, print, totalTurnsPlayed } from "kolmafia";
import { $items, $location, get, maxBy } from "libram";
import { HIGHLIGHT, sober } from "../lib";
import { guzzlrFactory } from "./guzzlr";
import {
  canAdventureOrUnlock,
  canWander,
  defaultFactory,
  DraggableFight,
  unlock,
  WandererFactory,
  WandererLocation,
} from "./lib";
import { lovebugsFactory } from "./lovebugs";
import { freefightFactory } from "./freefight";
import { eightbitFactory } from "./eightbit";

export type { DraggableFight };

const wanderFactories: WandererFactory[] = [
  defaultFactory,
  freefightFactory,
  lovebugsFactory,
  guzzlrFactory,
  eightbitFactory,
];

function bestWander(
  type: DraggableFight,
  locationSkiplist: Location[],
  nameSkiplist: string[],
): WandererLocation {
  const possibleLocations = new Map<Location, WandererLocation>();

  for (const wanderFactory of wanderFactories) {
    const wanderTargets = wanderFactory(type, locationSkiplist);
    for (const wanderTarget of wanderTargets) {
      if (
        !nameSkiplist.includes(wanderTarget.name) &&
        !locationSkiplist.includes(wanderTarget.location) &&
        canWander(wanderTarget.location, type)
      ) {
        const wandererLocation: WandererLocation = possibleLocations.get(wanderTarget.location) ?? {
          location: wanderTarget.location,
          targets: [],
          value: 0,
        };
        wandererLocation.targets = [...wandererLocation.targets, wanderTarget];
        wandererLocation.value += wanderTarget.value;
        possibleLocations.set(wandererLocation.location, wandererLocation);
      }
    }
  }

  if (possibleLocations.size === 0) {
    throw "Could not determine a wander target!";
  }

  return maxBy([...possibleLocations.values()], "value");
}

/**
 * Recursively Check for zones to wander to
 * @param type type of fight we are looking for
 * @param nameSkiplist Any wanderer tasks that should be skipped because they could not be prepared
 * @param locationSkiplist Any locations that should be skipped because they could not be unlocked
 * @returns A location at which to wander
 */
function wanderWhere(
  type: DraggableFight,
  nameSkiplist: string[] = [],
  locationSkiplist: Location[] = [],
): Location {
  const candidate = bestWander(type, locationSkiplist, nameSkiplist);
  const failed = candidate.targets.filter((target) => !target.prepareTurn());

  const badLocation =
    !canAdventureOrUnlock(candidate.location) ||
    !unlock(candidate.location, candidate.value) ||
    !canWander(candidate.location, type)
      ? [candidate.location]
      : [];

  if (failed.length > 0 || badLocation.length > 0) {
    return wanderWhere(
      type,
      [...nameSkiplist, ...failed.map((target) => target.name)],
      [...locationSkiplist, ...badLocation],
    );
  } else {
    const targets = candidate.targets.map((t) => t.name).join("; ");
    const value = candidate.value.toFixed(2);
    print(`Wandering at ${candidate.location} for expected value ${value} (${targets})`, HIGHLIGHT);

    return candidate.location;
  }
}

export type WanderOptions = { drunkSafe?: boolean; allowEquipment?: boolean };
const defaultWanderOptions = {
  drunkSafe: true,
  allowEquipment: true,
};

class WandererManager {
  quartetChoice = get("lastQuartetRequest") || 4;
  unsupportedChoices = new Map<Location, { [choice: number]: number | string }>([
    [$location`The Spooky Forest`, { 502: 2, 505: 2 }],
    [$location`Guano Junction`, { 1427: 1 }],
    [$location`The Hidden Apartment Building`, { 780: 6, 1578: 6 }],
    [$location`The Black Forest`, { 923: 1, 924: 1 }],
    [$location`LavaCo™ Lamp Factory`, { 1091: 9 }],
    [$location`The Haunted Laboratory`, { 884: 6 }],
    [$location`The Haunted Nursery`, { 885: 6 }],
    [$location`The Haunted Storage Room`, { 886: 6 }],
    [$location`The Haunted Ballroom`, { 106: 3, 90: this.quartetChoice }], // Skip, and Choose currently playing song, or skip
    [$location`The Haunted Library`, { 163: 4, 888: 4, 889: 5 }],
    [$location`The Haunted Gallery`, { 89: 6, 91: 2 }],
    [$location`The Hidden Park`, { 789: 6 }],
    [$location`A Mob of Zeppelin Protesters`, { 1432: 1, 856: 2, 857: 2, 858: 2 }],
    [$location`A-Boo Peak`, { 1430: 2 }],
    [$location`Sloppy Seconds Diner`, { 919: 6 }],
    [$location`VYKEA`, { 1115: 6 }],
    [
      $location`The Castle in the Clouds in the Sky (Basement)`,
      {
        669: 1,
        670: 4,
        671: 4,
      },
    ],
    [
      $location`The Haunted Bedroom`,
      {
        876: 1, // old leather wallet, 500 meat
        877: 1, // old coin purse, 500 meat
        878: 1, // 400-600 meat
        879: 2, // grouchy spirit
        880: 2, // a dumb 75 meat club
      },
    ],
    [$location`The Copperhead Club`, { 855: 4 }],
    [$location`The Haunted Bathroom`, { 882: 2 }], // skip; it's the towel adventure but we don't want towels
    [
      $location`The Castle in the Clouds in the Sky (Top Floor)`,
      {
        1431: 1,
        675: 4, // Go to Steampunk choice
        676: 4, // Go to Punk Rock choice
        677: 1, // Fight Steam Punk Giant
        678: 3, // Go to Steampunk choice
      },
    ],
    [
      $location`The Castle in the Clouds in the Sky (Ground Floor)`,
      {
        672: 3, // Skip
        673: 3, // Skip
        674: 3, // Skip
        1026: 3, // Skip
      },
    ],
    [$location`The Hidden Office Building`, { 786: 6 }],
    [$location`Cobb's Knob Barracks`, { 522: 2 }], // skip
    [$location`The Penultimate Fantasy Airship`, { 178: 2, 182: 1 }], // Skip, and Fight random enemy
    [$location`The Haiku Dungeon`, { 297: 3 }], // skip
  ]);
  equipment = new Map<Location, Item[]>([
    ...Location.all()
      .filter((l) => l.zone === "The 8-Bit Realm")
      .map((l): [Location, Item[]] => [l, $items`continuum transfunctioner`]),
    [$location`Shadow Rift (The 8-Bit Realm)`, $items`continuum transfunctioner`],
  ]);

  cacheKey = "";
  targets: Partial<{ [x in DraggableFight]: Location }> = {};

  getTarget(draggableFight: DraggableFight, options: WanderOptions = {}): Location {
    const { drunkSafe, allowEquipment } = { ...defaultWanderOptions, ...options };
    const newKey = `${myTotalTurnsSpent()};${totalTurnsPlayed()};${get("familiarSweat")}`;
    if (this.cacheKey !== newKey) this.clear();
    this.cacheKey = newKey;

    const locationSkipList = allowEquipment ? [] : [...this.equipment.keys()];

    return sober() || !drunkSafe
      ? (this.targets[draggableFight] ??= wanderWhere(draggableFight, [], locationSkipList))
      : $location`Drunken Stupor`;
  }

  getChoices(
    draggableFight: DraggableFight,
    options: WanderOptions = {},
  ): { [choice: number]: string | number } {
    return this.unsupportedChoices.get(this.getTarget(draggableFight, options)) ?? {};
  }

  clear(): void {
    this.targets = {};
  }

  getEquipment(
    draggableFight: DraggableFight,
    options: WanderOptions = defaultWanderOptions,
  ): Item[] {
    return this.equipment.get(this.getTarget(draggableFight, options)) ?? [];
  }
}

const wandererManager = new WandererManager();

export default wandererManager;
