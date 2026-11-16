import { mallPrice, myLevel, use, visitUrl } from "kolmafia";
import {
  $item,
  $location,
  $monster,
  clamp,
  get,
  getModifier,
  sum,
} from "libram";

import { Macro } from "../../combat";
import { GarboStrategy } from "../../combatStrategy";
import { garboValue } from "../../garboValue";
import { questStep, songboomMeat } from "../../lib";
import { barfOutfit } from "../../outfit/barf";
import { acquire } from "../../acquire";
import { AlternateTask } from "../engine";
import { FarmingContext } from "../context";

// questL04Bat: started -> step1 -> step2 (one step per sonar-in-a-biscuit),
// step3 = the Boss Bat's Lair is open, step4 = Boss Bat defeated.
const LAIR_OPEN_STEP = 3;
const BOSS_DEFEATED_STEP = 4;

const lair = () => $location`The Boss Bat's Lair`;
const bossBatStep = () => questStep("questL04Bat");
const sonarsNeeded = () => clamp(LAIR_OPEN_STEP - bossBatStep(), 0, 3);

/**
 * Both the Boss Bat and its beefy bodyguard bats are NOBANISH, so the Boss Bat
 * can't be banished to farm bodyguards forever. Mafia's model of the lair
 * (AreaCombatData): bodyguards only for the first 4 turns, then each turn is a
 * 50/50 between a bodyguard and the Boss Bat, and after 8 turns only the Boss
 * Bat remains. Killing the Boss Bat closes the lair.
 */
function expectedBodyguards(): number {
  const spent = lair().turnsSpent;
  const guaranteed = Math.max(0, 4 - spent);
  const coinFlips = clamp(8 - Math.max(spent, 4), 0, 4);
  return guaranteed + (1 - 0.5 ** coinFlips);
}

function expectedLairTurns(): number {
  // The Boss Bat always shows up eventually, and costs a turn too
  return expectedBodyguards() + 1;
}

function bodyguardMeat(): number {
  // Our meat% outside of combat is a rough stand in for the barf outfit we'll
  // be wearing; this runs late in the day, after we've been farming in it.
  const meatMultiplier = 1 + Math.max(0, getModifier("Meat Drop")) / 100;
  return (
    (($monster`beefy bodyguard bat`.minMeat +
      $monster`beefy bodyguard bat`.maxMeat) /
      2 +
      songboomMeat()) *
    meatMultiplier
  );
}

function bossBatDropValue(): number {
  return sum([$item`dense meat stack`, $item`batskin belt`], (item) =>
    garboValue(item),
  );
}

function bossBatProfit(): number {
  return (
    expectedBodyguards() * bodyguardMeat() +
    bossBatDropValue() -
    sonarsNeeded() * mallPrice($item`sonar-in-a-biscuit`) -
    expectedLairTurns() * get("valueOfAdventure")
  );
}

const bossBatAvailable = () =>
  myLevel() >= 4 && bossBatStep() < BOSS_DEFEATED_STEP;

export const BossBatTasks: AlternateTask<FarmingContext>[] = [
  {
    name: "Boss Bat: Unlock Lair",
    ready: () => bossBatAvailable() && bossBatProfit() > 0,
    completed: () => bossBatStep() >= LAIR_OPEN_STEP,
    do: () => {
      // The council hands out the quest once we're level 4
      if (bossBatStep() < 0) visitUrl("council.php");
      if (bossBatStep() < 0) {
        throw new Error("Unable to start the Boss Bat quest at the council");
      }

      const sonars = sonarsNeeded();
      // Skip the Guano Junction stench and Bat Hole delay: sonars open the
      // next section of the Bat Hole without spending any turns
      acquire(
        sonars,
        $item`sonar-in-a-biscuit`,
        get("valueOfAdventure"), // a sonar should never cost more than a turn
      );
      use(sonars, $item`sonar-in-a-biscuit`);
      if (bossBatStep() < LAIR_OPEN_STEP) {
        throw new Error("Failed to open the Boss Bat's Lair with sonars");
      }
    },
    spendsTurn: false,
    turns: () => 0,
  },
  {
    name: "Boss Bat: Fight Bodyguards",
    ready: () =>
      bossBatAvailable() &&
      bossBatStep() >= LAIR_OPEN_STEP &&
      bossBatProfit() > 0,
    completed: () => bossBatStep() >= BOSS_DEFEATED_STEP,
    do: lair,
    outfit: () => barfOutfit({}),
    combat: new GarboStrategy(() => Macro.meatKill()),
    turns: () => (bossBatAvailable() ? Math.ceil(expectedLairTurns()) : 0),
    spendsTurn: true,
  },
];
