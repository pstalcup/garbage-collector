import {
  appearanceRates,
  canAdventure,
  getLocationMonsters,
  itemDropsArray,
  Location,
  toMonster,
} from "kolmafia";
import { sum } from "libram";
import { garboValue } from "../session";
import { canWander, DraggableFight, UnlockableZones, WandererTarget } from "./lib";

function averageYrValue(location: Location) {
  const rates = appearanceRates(location);
  const monsters = Object.keys(getLocationMonsters(location))
    .map((m) => toMonster(m))
    .filter(
      (m) =>
        !["LUCKY", "ULTRARARE", "BOSS"].some((s) => m.attributes.includes(s) && rates[m.name] > 0)
    );

  if (monsters.length === 0) {
    return 0;
  } else {
    return (
      sum(monsters, (m) => {
        const items = itemDropsArray(m).filter((drop) => ["", "n"].includes(drop.type));
        return sum(items, (drop) => garboValue(drop.drop));
      }) / monsters.length
    );
  }
}

function yrValues(): Map<Location, number> {
  const values = new Map<Location, number>();
  for (const location of Location.all()) {
    values.set(location, averageYrValue(location));
  }
  return values;
}

function maxBy<T>(array: T[], key: (t: T) => number): T {
  return array
    .map((t: T) => {
      return { t, value: key(t) };
    })
    .reduce((prev, curr) => (prev.value < curr.value ? curr : prev)).t;
}

export function yellowRayFactory(type: DraggableFight): WandererTarget[] | undefined {
  if (type === "yellow ray") {
    const validLocations = Location.all().filter(
      (location) => canWander(location, "yellow ray") && canAdventure(location)
    );
    const locationValues = yrValues();

    const bestZones = new Set<Location>();
    for (const unlockableZone of UnlockableZones) {
      const extraLocations = Location.all().filter((l) => l.zone === unlockableZone.zone);
      bestZones.add(
        maxBy([...validLocations, ...extraLocations], (l: Location) => locationValues.get(l) ?? 0)
      );
    }
    if (bestZones.size > 0) {
      return [...bestZones].map(
        (l) => new WandererTarget(`Yellow Ray ${l}`, l, locationValues.get(l) ?? 0)
      );
    }
  }
  return undefined;
}
