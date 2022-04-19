import {
  booleanModifier,
  cliExecute,
  Familiar,
  haveEquipped,
  mallPrice,
  myLevel,
  retrieveItem,
  use,
  useFamiliar,
  visitUrl,
} from "kolmafia";
import {
  $effect,
  $familiar,
  $item,
  $location,
  adventureMacroAuto,
  Counter,
  findLeprechaunMultiplier,
  get,
  have,
  Requirement,
  set,
} from "libram";
import { Macro } from "./combat";
import { reservedDiet } from "./diet";
import { globalOptions, realmAvailable, setChoice } from "./lib";
import { familiarWaterBreathingEquipment, waterBreathingEquipment } from "./outfit";
import { wanderersInRange } from "./wanderer";

export function checkUnderwater() {
  // first check to see if underwater even makes sense
  if (
    myLevel() >= 11 &&
    !(get("_envyfishEggUsed") || have($item`envyfish egg`)) &&
    (get("_garbo_weightChain", false) || !have($familiar`Pocket Professor`)) &&
    (booleanModifier("Adventure Underwater") ||
      waterBreathingEquipment.some((item) => have(item))) &&
    (booleanModifier("Underwater Familiar") ||
      familiarWaterBreathingEquipment.some((item) => have(item))) &&
    (have($effect`Fishy`) || (have($item`fishy pipe`) && !get("_fishyPipeUsed")))
  ) {
    const sourceCount = noncombatForceSources().length;
    // then check if the underwater copy makes sense
    if (mallPrice($item`pulled green taffy`) < 10000 && retrieveItem($item`pulled green taffy`)) {
      // unlock the sea
      if (get("questS01OldGuy") === "unstarted") {
        visitUrl("place.php?whichplace=sea_oldman&action=oldman_oldman");
      }
      if (!have($effect`Fishy`) && !get("_fishyPipeUsed")) use($item`fishy pipe`);

      return wanderersInRange(sourceCount) <= 1 && have($effect`Fishy`);
    }
  }

  return false;
}

function noncombatForceSources(): { use: () => boolean }[] {
  return [
    {
      available: have($item`Clara's bell`) && !globalOptions.clarasBellClaimed,
      use: () => {
        globalOptions.clarasBellClaimed = true;
        if (use($item`Clara's bell`)) return true;
        return false;
      },
    },
    {
      available: have($item`Eight Days a Week Pill Keeper`) && !get("_freePillKeeperUsed"),
      use: () => {
        if (cliExecute("pillkeeper noncombat") && get("_freePillKeeperUsed")) {
          // Defense against mis-set counters
          set("_freePillKeeperUsed", true);
          return true;
        }
        return false;
      },
    },
    ...reservedDiet
      .filter((resevedDietItem) => resevedDietItem.menuItem.data === "yachtzee")
      .map((resevedDietItem) => {
        return {
          available: true,
          use: () => {
            try {
              resevedDietItem.consume();
              return true;
            } catch {
              return false;
            }
          },
        };
      }),
  ].filter((value) => value.available);
}

export function yachtzee(): void {
  if (!realmAvailable("sleaze") || !have($effect`Fishy`)) return;

  const familiar =
    Familiar.all()
      .filter((familiar) => have(familiar) && familiar.underwater)
      .filter((familiar) => familiar !== $familiar`Robortender`)
      .sort((a, b) => findLeprechaunMultiplier(b) - findLeprechaunMultiplier(a))[0] ??
    $familiar`none`;

  for (const { use } of noncombatForceSources()) {
    useFamiliar(familiar);

    const underwaterBreathingGear = waterBreathingEquipment.find((item) => have(item));
    if (!underwaterBreathingGear) return;
    const equippedOutfit = new Requirement(["meat", "-tie"], {
      forceEquip: [underwaterBreathingGear],
    }).maximize();
    if (haveEquipped($item`The Crown of Ed the Undying`)) cliExecute("edpiece fish");

    if (equippedOutfit && use()) {
      setChoice(918, 2);
      adventureMacroAuto($location`The Sunken Party Yacht`, Macro.abort());
      if (get("lastEncounter") === "Yacht, See?") {
        adventureMacroAuto($location`The Sunken Party Yacht`, Macro.abort());
      }
    }
  }
}
