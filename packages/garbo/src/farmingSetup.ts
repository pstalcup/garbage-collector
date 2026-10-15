import { maximize } from "kolmafia";
import { targetingMeat } from "./lib";
import { meatMood } from "./mood";
import { potionSetup } from "./potions";
import { estimatedGarboTurns } from "./turns";
import {
  BuffExtensionQuest,
  PostBuffExtensionQuest,
} from "./tasks/buffExtension";
import { EmbezzlerFightsQuest } from "./tasks/embezzler";
import { runGarboFarmQuests, runGarboQuests } from "./tasks/engine";
import { FarmQuests } from "./tasks/farm";
import { FinishUpQuest } from "./tasks/finishUp";
import { PostQuest } from "./tasks/post";

/*
  Building blocks for the farming phase of the day. Farming strategies list the
  setup steps they want before farming, and how they farm their turns.
*/

export function useFarmingPotions(): void {
  potionSetup(false);
}

export function castFarmingBuffs(): void {
  maximize("MP", false);
  meatMood().execute(estimatedGarboTurns());
}

export function extendFarmingBuffs(): void {
  runGarboQuests([BuffExtensionQuest, PostBuffExtensionQuest]);
}

export function fightLuckyTargets(): void {
  if (!targetingMeat()) runGarboQuests([EmbezzlerFightsQuest]);
}

export function farmTurns(): void {
  runGarboFarmQuests([PostQuest(), ...FarmQuests()]);
  runGarboQuests([FinishUpQuest]);
}
