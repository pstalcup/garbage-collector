import {
  autosellPrice,
  availableAmount,
  buy,
  chew,
  cliExecute,
  drink,
  eat,
  elementalResistance,
  fullnessLimit,
  getClanLounge,
  getProperty,
  haveEffect,
  inebrietyLimit,
  itemType,
  mallPrice,
  myClass,
  myFamiliar,
  myFullness,
  myInebriety,
  myLevel,
  myMaxhp,
  mySpleenUse,
  print,
  setProperty,
  spleenLimit,
  turnsPerCast,
  use,
  useFamiliar,
  userConfirm,
  useSkill,
  wait,
} from "kolmafia";
import {
  $class,
  $classes,
  $effect,
  $element,
  $familiar,
  $item,
  $items,
  $monster,
  $skill,
  clamp,
  Diet,
  get,
  getAverageAdventures,
  have,
  Kmail,
  maximizeCached,
  MayoClinic,
  MenuItem,
  set,
  sum,
  sumNumbers,
} from "libram";
import { acquire } from "./acquire";
import { withVIPClan } from "./clan";
import { embezzlerCount, estimatedTurns } from "./embezzler";
import { expectedGregs } from "./extrovermectin";
import { argmax, arrayEquals, globalOptions, HIGHLIGHT, realmAvailable } from "./lib";
import { Potion, PotionTier } from "./potions";
import { garboValue } from "./session";
import synthesize from "./synthesis";

const MPA = get("valueOfAdventure");
print(`Using adventure value ${MPA}.`, HIGHLIGHT);

const Mayo = MayoClinic.Mayo;
type Note = PotionTier | null;

function eatSafe(qty: number, item: Item) {
  if (have($item`Universal Seasoning`) && !get("_universalSeasoningUsed")) {
    use($item`Universal Seasoning`);
  }
  if (myLevel() >= 15 && !get("_hungerSauceUsed") && mallPrice($item`Hunger™ Sauce`) < 3 * MPA) {
    acquire(1, $item`Hunger™ Sauce`, 3 * MPA);
    use($item`Hunger™ Sauce`);
  }
  if (mallPrice($item`fudge spork`) < 3 * MPA && !get("_fudgeSporkUsed")) {
    eat($item`fudge spork`);
  }
  useIfUnused($item`milk of magnesium`, "_milkOfMagnesiumUsed", 5 * MPA);

  if (!eat(qty, item)) throw "Failed to eat safely";
}

function drinkSafe(qty: number, item: Item) {
  const prevDrunk = myInebriety();
  if (have($skill`The Ode to Booze`)) {
    const odeTurns = qty * item.inebriety;
    const castTurns = odeTurns - haveEffect($effect`Ode to Booze`);
    if (castTurns > 0) {
      useSkill(
        $skill`The Ode to Booze`,
        Math.ceil(castTurns / turnsPerCast($skill`The Ode to Booze`))
      );
    }
  }
  if (!drink(qty, item)) throw "Failed to drink safely";
  if (item.inebriety === 1 && prevDrunk === qty + myInebriety() - 1) {
    // sometimes mafia does not track the mime army shotglass property
    setProperty("_mimeArmyShotglassUsed", "true");
  }
}

function chewSafe(qty: number, item: Item) {
  if (!chew(qty, item)) throw "Failed to chew safely";
}

function consumeSafe(qty: number, item: Item, additionalValue?: number) {
  const spleenCleaned = spleenCleaners.get(item);
  if (spleenCleaned && mySpleenUse() < spleenCleaned) {
    throw "No spleen to clear with this.";
  }
  const averageAdventures = getAverageAdventures(item);
  if (averageAdventures > 0 || additionalValue) {
    const cap = Math.max(0, averageAdventures * MPA) + (additionalValue ?? 0);
    acquire(qty, item, cap);
  } else {
    acquire(qty, item);
  }
  if (itemType(item) === "food") eatSafe(qty, item);
  else if (itemType(item) === "booze") drinkSafe(qty, item);
  else if (itemType(item) === "spleen item") chewSafe(qty, item);
  else use(qty, item);
}

function propTrue(prop: string | boolean) {
  if (typeof prop === "boolean") {
    return prop as boolean;
  } else {
    return get(prop);
  }
}

function useIfUnused(item: Item, prop: string | boolean, maxPrice: number) {
  if (!propTrue(prop)) {
    if (mallPrice(item) <= maxPrice) {
      acquire(1, item, maxPrice, false);
      if (!have(item)) return;
      use(1, item);
    } else {
      print(`Skipping ${item.name}; too expensive (${mallPrice(item)} > ${maxPrice}).`);
    }
  }
}

function nonOrganAdventures(): void {
  useIfUnused($item`fancy chocolate car`, get("_chocolatesUsed") === 0, 2 * MPA);

  while (get("_loveChocolatesUsed") < 3) {
    const price = have($item`LOV Extraterrestrial Chocolate`) ? 15000 : 20000;
    const value = clamp(3 - get("_loveChocolatesUsed"), 0, 3) * get("valueOfAdventure");
    if (value < price) break;
    if (!have($item`LOV Extraterrestrial Chocolate`)) {
      Kmail.send("sellbot", `${$item`LOV Extraterrestrial Chocolate`.name} (1)`, undefined, 20000);
      wait(11);
      cliExecute("refresh inventory");
      if (!have($item`LOV Extraterrestrial Chocolate`)) {
        print("I'm tired of waiting for sellbot to send me some chocolate", "red");
        break;
      }
    }
    use($item`LOV Extraterrestrial Chocolate`);
  }

  const chocos = new Map([
    [$class`Seal Clubber`, $item`chocolate seal-clubbing club`],
    [$class`Turtle Tamer`, $item`chocolate turtle totem`],
    [$class`Pastamancer`, $item`chocolate pasta spoon`],
    [$class`Sauceror`, $item`chocolate saucepan`],
    [$class`Accordion Thief`, $item`chocolate stolen accordion`],
    [$class`Disco Bandit`, $item`chocolate disco ball`],
  ]);
  const classChoco = chocos.get(myClass());
  const chocExpVal = (remaining: number, item: Item): number => {
    const advs = [0, 0, 1, 2, 3][remaining + (item === classChoco ? 1 : 0)];
    return advs * MPA - mallPrice(item);
  };
  const chocosRemaining = clamp(3 - get("_chocolatesUsed"), 0, 3);
  for (let i = chocosRemaining; i > 0; i--) {
    const chocoVals = Array.from(chocos.values()).map((choc) => {
      return {
        choco: choc,
        value: chocExpVal(i, choc),
      };
    });
    const best = chocoVals.sort((a, b) => b.value - a.value)[0];
    if (best.value > 0) {
      acquire(1, best.choco, best.value + mallPrice(best.choco), false);
      use(1, best.choco);
    } else break;
  }

  useIfUnused(
    $item`fancy chocolate sculpture`,
    get("_chocolateSculpturesUsed") < 1,
    5 * MPA + 5000
  );
  useIfUnused($item`essential tofu`, "_essentialTofuUsed", 5 * MPA);

  if (!get("_etchedHourglassUsed") && have($item`etched hourglass`)) {
    use(1, $item`etched hourglass`);
  }

  if (getProperty("_timesArrowUsed") !== "true" && mallPrice($item`time's arrow`) < 5 * MPA) {
    acquire(1, $item`time's arrow`, 5 * MPA);
    cliExecute("csend 1 time's arrow to botticelli");
    setProperty("_timesArrowUsed", "true");
  }

  if (have($skill`Ancestral Recall`) && mallPrice($item`blue mana`) < 3 * MPA) {
    const casts = Math.max(10 - get("_ancestralRecallCasts"), 0);
    acquire(casts, $item`blue mana`, 3 * MPA);
    useSkill(casts, $skill`Ancestral Recall`);
  }

  if (globalOptions.ascending) useIfUnused($item`borrowed time`, "_borrowedTimeUsed", 5 * MPA);
}

function pillCheck(): void {
  if (!get("_distentionPillUsed")) {
    if (!get<boolean>("garbo_skipPillCheck", false) && !have($item`distention pill`, 1)) {
      set(
        "garbo_skipPillCheck",
        userConfirm(
          "You do not have any distention pills. Continue anyway? (Defaulting to no in 15 seconds)",
          15000,
          false
        )
      );
    }
  }

  if (!get("_syntheticDogHairPillUsed")) {
    if (!get<boolean>("garbo_skipPillCheck", false) && !have($item`synthetic dog hair pill`, 1)) {
      set(
        "garbo_skipPillCheck",
        userConfirm(
          "You do not have any synthetic dog hair pills. Continue anyway? (Defaulting to no in 15 seconds)",
          15000,
          false
        )
      );
    }
  }
}

const saladFork = $item`Ol' Scratch's salad fork`;
const frostyMug = $item`Frosty's frosty mug`;
const spleenCleaners = new Map([
  [$item`extra-greasy slider`, 5],
  [$item`jar of fermented pickle juice`, 5],
  [$item`mojo filter`, 1],
]);
const stomachLiverCleaners = new Map([
  [$item`spice melange`, [-3, -3]],
  [$item`synthetic dog hair pill`, [0, -1]],
  [$item`cuppa Sobrie tea`, [0, -1]],
]);

/**
 * Generate a basic menu of high-yield items to consider
 * @returns basic menu
 */
function menu(): MenuItem<Note>[] {
  const spaghettiBreakfast =
    have($item`spaghetti breakfast`) &&
    myFullness() === 0 &&
    get("_timeSpinnerFoodAvailable") === "" &&
    !get("_spaghettiBreakfastEaten")
      ? 1
      : 0;

  /*
   * generated in mafia with an account that has super human cocktail crafting
   *  > js Item.all().filter((item) => item.inebriety > 0 && item.quality === "EPIC" && getIngredients(item)["mushroom fermenting powder]).join(", ")
   */
  const complexMushroomWines = $items`overpowering mushroom wine, complex mushroom wine, smooth mushroom wine, blood-red mushroom wine, buzzing mushroom wine, swirling mushroom wine`;
  /*
   * generated in mafia with:
   *  > js Item.all().filter((item) => item.inebriety > 0 && getIngredients(item)["perfect ice cube"]).join(", ")
   */
  const perfectDrinks = $items`perfect cosmopolitan, perfect negroni, perfect dark and stormy, perfect mimosa, perfect old-fashioned, perfect paloma`;
  /*
   * generated in mafia with an account that has Transcendental Noodlecraft
   *  > js Item.all().filter((item) => item.fullness > 0 && item.name.indexOf("lasagna") > 0 && getIngredients(item)["savory dry noodles"]).join(", ")
   */
  const lasagnas = $items`fishy fish lasagna, gnat lasagna, long pork lasagna`;
  const smallEpics = $items`meteoreo, ice rice`.concat([$item`Tea, Earl Grey, Hot`]);

  const boxingDayCareItems = $items`glass of raw eggs, punch-drunk punch`.filter((item) =>
    have(item)
  );
  const pilsners = $items`astral pilsner`.filter((item) => globalOptions.ascending && have(item));
  const limitedItems = [...boxingDayCareItems, ...pilsners].map(
    (item) => new MenuItem<Note>(item, { maximum: availableAmount(item) })
  );

  const mallMin = (items: Item[]) => argmax(items.map((i) => [i, -mallPrice(i)]));

  return [
    // FOOD
    new MenuItem($item`Dreadsylvanian spooky pocket`),
    new MenuItem($item`tin cup of mulligan stew`),
    new MenuItem($item`frozen banquet`),
    new MenuItem($item`spaghetti breakfast`, { maximum: spaghettiBreakfast }),
    new MenuItem($item`extra-greasy slider`),
    new MenuItem(mallMin(lasagnas)),
    new MenuItem(mallMin(smallEpics)),

    // BOOZE
    new MenuItem($item`elemental caipiroska`),
    new MenuItem($item`moreltini`),
    new MenuItem($item`Dreadsylvanian grimlet`),
    new MenuItem($item`Hodgman's blanket`),
    new MenuItem($item`Sacramento wine`),
    new MenuItem($item`iced plum wine`),
    new MenuItem($item`splendid martini`),
    new MenuItem($item`Eye and a Twist`),
    new MenuItem($item`jar of fermented pickle juice`),
    new MenuItem(mallMin(complexMushroomWines)),
    new MenuItem(mallMin(perfectDrinks)),

    // SPLEEN
    new MenuItem($item`octolus oculus`),
    new MenuItem($item`prismatic wad`),
    new MenuItem($item`transdermal smoke patch`),
    new MenuItem($item`antimatter wad`),
    new MenuItem($item`voodoo snuff`),
    new MenuItem($item`blood-drive sticker`),

    // MISC
    ...limitedItems,

    // HELPERS
    new MenuItem($item`distention pill`),
    new MenuItem($item`cuppa Voraci tea`),
    new MenuItem(Mayo.flex),
    new MenuItem(Mayo.zapine),
    new MenuItem($item`Special Seasoning`),
    new MenuItem(saladFork),
    new MenuItem(frostyMug),
    new MenuItem($item`mojo filter`),
    new MenuItem($item`pocket wish`, { maximum: 1, effect: $effect`Refined Palate` }),
    new MenuItem($item`toasted brie`, { maximum: 1 }),
    new MenuItem($item`potion of the field gar`, { maximum: 1 }),
    ...[...stomachLiverCleaners.keys()].map((item) => new MenuItem<Note>(item)),
    new MenuItem($item`sweet tooth`, { size: -1, organ: "food", maximum: 1 }),
  ];
}

function gregariousCount(): {
  expectedGregariousFights: number[];
  marginalGregariousFights: number;
} {
  const gregariousCharges =
    get("beGregariousCharges") +
    (get("beGregariousFightsLeft") > 0 &&
    get("beGregariousMonster") === $monster`Knob Goblin Embezzler`
      ? 1
      : 0);
  const gregariousFightsPerCharge = expectedGregs();
  // remove and preserve the last index - that is the marginal count of gregarious fights
  const marginalGregariousFights = gregariousFightsPerCharge.splice(
    gregariousFightsPerCharge.length - 1,
    1
  )[0];

  const expectedGregariousFights = gregariousFightsPerCharge.slice(gregariousCharges);

  return {
    expectedGregariousFights,
    marginalGregariousFights,
  };
}

function copiers(): MenuItem<Note>[] {
  // assuming embezzler is worth 4 * MPA and a marginal turn is 1 * MPA, the differential is 3 * MPA
  const embezzlerDifferential = 3 * MPA;
  const { expectedGregariousFights, marginalGregariousFights } = gregariousCount();
  const extros =
    myInebriety() > inebrietyLimit()
      ? []
      : [
          ...expectedGregariousFights.map(
            (embezzlers) =>
              new MenuItem<Note>($item`Extrovermectin™`, {
                additionalValue: embezzlers * embezzlerDifferential,
                maximum: 1,
              })
          ),
          new MenuItem<Note>($item`Extrovermectin™`, {
            additionalValue: marginalGregariousFights * embezzlerDifferential,
          }),
        ];
  return [...extros];
}

function countCopies(diet: Diet<Note>): number {
  // this only counts the copies not yet realized
  // any copies already realized will be properly counted by embezzlerCount

  // returns an array of expected counts for number of greg copies to fight per pill use
  // the last value is how much you expect to fight per pill
  const extros = sumNumbers(
    diet.entries.map((dietEntry) =>
      dietEntry.menuItems.some((menuItem) => menuItem.item === $item`Extrovermectin™`)
        ? dietEntry.quantity
        : 0
    )
  );
  const { expectedGregariousFights, marginalGregariousFights } = gregariousCount();

  // slice will never return an array that is bigger than the original array
  const replaceExtros = sumNumbers(expectedGregariousFights.slice(0, extros));
  const bonusExtros =
    clamp(extros - expectedGregariousFights.length, 0, extros) * marginalGregariousFights;

  return replaceExtros + bonusExtros;
}

/**
 * Generate a potion diet that has entries
 * @param embezzlers number of embezzlers expected to be encountered on this day
 * @param turns number of turns total expecte
 */
export function potionMenu(
  baseMenu: MenuItem<Note>[],
  embezzlers: number,
  turns: number
): MenuItem<Note>[] {
  function limitedPotion(
    input: Item | Potion,
    limit?: number,
    options: { price?: number; organ?: "spleen item" | "booze" | "food"; size?: number } = {}
  ): MenuItem<Note>[] {
    if (limit === 0) {
      return [];
    }

    let potion = input instanceof Item ? new Potion(input) : input;
    let mayo: Item | undefined = undefined;
    if (itemType(potion.potion) === "food" && MayoClinic.installed()) {
      potion = potion.doubleDuration();
      mayo = Mayo.zapine;
    }
    return potion.value(embezzlers, turns, limit).map(
      (tier) =>
        new MenuItem(potion.potion, {
          maximum: tier.quantity,
          additionalValue: tier.value,
          priceOverride: options.price,
          organ: options.organ,
          size: options.size,
          data: tier.name,
          mayo,
        })
    );
  }
  function potion(potion: Item | Potion, options = {}): MenuItem<Note>[] {
    return limitedPotion(potion, undefined, options);
  }

  const speakeasy = $item`Clan speakeasy`;
  const hasSpeakeasy = getClanLounge()[`${speakeasy}`];

  const twiceHauntedPrice =
    Math.min(
      garboValue($item`haunted orange`),
      garboValue($item`orange`) + garboValue($item`ghostly ectoplasm`)
    ) +
    Math.min(
      garboValue($item`haunted bottle of vodka`),
      garboValue($item`bottle of vodka`) + garboValue($item`ghostly ectoplasm`)
    );

  const muffin =
    !globalOptions.ascending && have($item`blueberry muffin`)
      ? limitedPotion($item`blueberry muffin`, 1, { price: 0 })
      : [];

  const campfireHotdog = get("getawayCampsiteUnlocked")
    ? potion($item`campfire hot dog`, { price: garboValue($item`stick of firewood`) })
    : [];

  const foodCone =
    realmAvailable("stench") || !globalOptions.noBarf
      ? limitedPotion($item`Dinsey food-cone`, Math.floor(availableAmount($item`FunFunds™`) / 2), {
          price: 2 * garboValue($item`FunFunds™`),
        })
      : [];

  return [
    ...baseMenu,
    ...copiers(),

    // FOOD POTIONS
    ...potion($item`jumping horseradish`),
    ...potion($item`tempura cauliflower`),
    ...potion($item`sea truffle`),
    ...potion($item`tempura broccoli`),
    ...potion($item`Miserable Pie`),
    ...potion($item`Every Day is Like This Sundae`),
    ...potion($item`bowl of mummy guts`),
    ...potion($item`haunted Hell ramen`),
    ...muffin,
    ...campfireHotdog,
    ...foodCone,

    // BOOZE POTIONS
    ...potion($item`dirt julep`),
    ...potion($item`Ambitious Turkey`),
    ...potion($item`Friendly Turkey`),
    ...potion($item`vintage smart drink`),
    ...potion($item`Strikes Again Bigmouth`),
    ...potion($item`Irish Coffee, English Heart`),
    ...potion($item`Jack-O-Lantern beer`),
    ...potion($item`Amensiac Ale`),
    ...potion($item`mentholated wine`),
    ...potion($item`Feliz Navidad`),
    ...potion($item`broberry brogurt`),
    ...potion($item`haunted martini`),
    ...potion($item`twice-haunted screwdriver`, { price: twiceHauntedPrice }),
    ...limitedPotion($item`Hot Socks`, hasSpeakeasy ? 3 : 0, { price: 5000 }),

    // SPLEEN POTIONS
    ...potion($item`cute mushroom`),
    ...potion($item`beggin' cologne`),
    ...potion($item`Knob Goblin nasal spray`),
    ...potion($item`handful of Smithereens`),
    ...potion($item`black striped oyster egg`),
    ...potion($item`black paisley oyster egg`),
    ...potion($item`black polka-dot oyster egg`),
    ...potion($item`lustrous oyster egg`),
    ...potion($item`glimmering buzzard feather`),
    ...potion($item`Knob Goblin pet-buffing spray`),
    ...potion($item`abstraction: joy`),
    ...potion($item`beastly paste`),
    ...potion($item`gleaming oyster egg`),
    ...potion($item`Party-in-a-Can™`),
    ...limitedPotion($item`body spradium`, clamp(availableAmount($item`body spradium`), 0, 1)),

    ...(have($skill`Sweet Synthesis`)
      ? potion(
          new Potion($item`Rethinking Candy`, {
            effect: $effect`Synthesis: Greed`,
            duration: 30,
          }),
          {
            size: 1,
            organ: "spleen item",
            price: 0,
          }
        )
      : []),
  ];
}

interface DietPlanner {
  (menu: MenuItem<Note>[]): Diet<Note>;
}
function balanceMenu(baseMenu: MenuItem<Note>[], dietPlanner: DietPlanner): MenuItem<Note>[] {
  const baseEmbezzlers = embezzlerCount();
  function rebalance(
    menu: MenuItem<Note>[],
    iterations: number,
    embezzlers: number,
    adventures: number
  ): MenuItem<Note>[] {
    const fullMenu = potionMenu(menu, baseEmbezzlers + embezzlers, estimatedTurns() + adventures);
    if (iterations <= 0) {
      return fullMenu;
    } else {
      const balancingDiet = dietPlanner(fullMenu);
      return rebalance(
        menu,
        iterations - 1,
        countCopies(balancingDiet),
        balancingDiet.expectedAdventures()
      );
    }
  }
  const baseDiet = dietPlanner(baseMenu);
  return rebalance(baseMenu, 5, 0, baseDiet.expectedAdventures());
}

export function computeDiet(): {
  diet: () => Diet<Note>;
  shotglass: () => Diet<Note>;
  pantsgiving: () => Diet<Note>;
} {
  // Handle spleen manually, as the diet planner doesn't support synth. Only fill food and booze.

  const orEmpty = (diet: Diet<Note>) =>
    diet.expectedValue(MPA, "net") < 0 ? new Diet<Note>() : diet;
  const fullDietPlanner = (menu: MenuItem<Note>[]) => orEmpty(Diet.plan(MPA, menu));
  const shotglassDietPlanner = (menu: MenuItem<Note>[]) =>
    orEmpty(Diet.plan(MPA, menu, { booze: 1 }));
  const pantsgivingDietPlanner = (menu: MenuItem<Note>[]) =>
    orEmpty(Diet.plan(MPA, menu, { food: 1 }));
  // const shotglassFilter = (menuItem: MenuItem)

  return {
    diet: () => fullDietPlanner(balanceMenu(menu(), fullDietPlanner)),
    shotglass: () =>
      shotglassDietPlanner(
        balanceMenu(
          menu().filter((menuItem) => itemType(menuItem.item) === "booze" && menuItem.size === 1),
          shotglassDietPlanner
        )
      ),
    pantsgiving: () =>
      pantsgivingDietPlanner(
        balanceMenu(
          menu().filter((menuItem) => itemType(menuItem.item) === "food" && menuItem.size === 1),
          pantsgivingDietPlanner
        )
      ),
  };
}

type DietName = "FULL" | "SHOTGLASS" | "PANTSGIVING" | "REMAINING";

function printDiet(diet: Diet<Note>, name: DietName) {
  print(`===== ${name} DIET =====`);
  if (diet.entries.length === 0) return;
  diet = diet.copy();
  diet.entries.sort((a, b) => itemPriority(b.menuItems) - itemPriority(a.menuItems));

  const embezzlers = Math.floor(embezzlerCount() + countCopies(diet));
  const adventures = Math.floor(estimatedTurns() + diet.expectedAdventures());
  print(`Planning to fight ${embezzlers} embezzlers and run ${adventures} adventures`);

  for (const dietEntry of diet.entries) {
    if (dietEntry.quantity === 0) continue;
    const target = dietEntry.target();
    const datastr = target.data ? `(${target.data})` : "";
    const maxstr = target.maximum ? ` (max ${target.maximum})` : "";
    const helpersstr =
      dietEntry.helpers().length > 0 ? ` helpers: ${dietEntry.helpers().join(", ")}` : "";
    const addvalstr = target.additionalValue
      ? ` (additional value: ${target.additionalValue})`
      : "";
    const valuestr = `value: ${Math.floor(
      dietEntry.expectedValue(MPA, diet)
    )}${addvalstr} price: ${Math.floor(dietEntry.expectedPrice())}`;
    print(`${dietEntry.quantity}${maxstr} ${target}${datastr}${helpersstr} ${valuestr}`);
  }
  const totalValue = diet.expectedValue(MPA);
  const totalCost = diet.expectedPrice();
  const netValue = totalValue - totalCost;
  print(
    `Assuming MPA of ${MPA}, Total Cost ${totalCost}, Total Value ${totalValue}, Net Value ${netValue}`
  );
}

// Item priority - higher means we eat it first.
// Anything that gives a consumption buff should go first (e.g. Refined Palate).
function itemPriority<T>(menuItems: MenuItem<T>[]) {
  // Last menu item is the food itself.
  const menuItem = menuItems[menuItems.length - 1];
  if (menuItem === undefined) {
    throw "Shouldn't have an empty menu item.";
  }
  if (menuItem.item === $item`spaghetti breakfast`) return 200;
  if (
    $items`pocket wish, toasted brie`.includes(menuItem.item) ||
    spleenCleaners.get(menuItem.item) ||
    stomachLiverCleaners.get(menuItem.item)
  ) {
    return 100;
  } else {
    return 0;
  }
}

export function consumeDiet(diet: Diet<Note>, name: DietName): void {
  if (diet.entries.length === 0) return;
  diet = diet.copy();
  diet.entries.sort((a, b) => itemPriority(b.menuItems) - itemPriority(a.menuItems));

  print();
  printDiet(diet, name);
  print();

  const seasoningCount = sum(diet.entries, ({ menuItems, quantity }) =>
    menuItems.some((menuItem) => menuItem.item === $item`Special Seasoning`) ? quantity : 0
  );
  acquire(seasoningCount, $item`Special Seasoning`, MPA);

  // Fill organs in rounds, making sure we're making progress in each round.
  const organs = () => [myFullness(), myInebriety(), mySpleenUse()];
  let lastOrgans = [-1, -1, -1];
  while (sum(diet.entries, ({ quantity }) => quantity) > 0) {
    if (arrayEquals(lastOrgans, organs())) {
      print();
      printDiet(diet, "REMAINING");
      print();
      throw "Failed to consume some diet item.";
    }
    lastOrgans = organs();

    for (const dietEntry of diet.entries) {
      const { menuItems, quantity } = dietEntry;
      if (quantity === 0) continue;

      let countToConsume = quantity;

      const capacity = {
        food: fullnessLimit() - myFullness(),
        booze: inebrietyLimit() - myInebriety(),
        "spleen item": spleenLimit() - mySpleenUse(),
      };
      for (const menuItem of menuItems) {
        if (menuItem.organ === "booze" && menuItem.size === 1 && !get("_mimeArmyShotglassUsed")) {
          countToConsume = 1;
        } else if (menuItem.organ && menuItem.size > 0) {
          countToConsume = Math.min(
            countToConsume,
            Math.floor(capacity[menuItem.organ] / menuItem.size)
          );
        }

        const cleaning = stomachLiverCleaners.get(menuItem.item);
        if (cleaning) {
          const [fullness, inebriety] = cleaning;
          if (myFullness() + fullness < 0 || myInebriety() + inebriety < 0) {
            countToConsume = 0;
          }
        }

        const spleenCleaned = spleenCleaners.get(menuItem.item);
        if (spleenCleaned) {
          countToConsume = Math.min(countToConsume, Math.floor(mySpleenUse() / spleenCleaned));
        }
      }

      if (countToConsume === 0) continue;

      for (const menuItem of menuItems) {
        if ([saladFork, frostyMug].includes(menuItem.item)) {
          const element = menuItem.item === saladFork ? $element`hot` : $element`cold`;
          if (myMaxhp() < 1000 * (1 - elementalResistance(element) / 100)) {
            maximizeCached(["0.05 HP", `${element} Resistance`]);
            if (myMaxhp() < 1000 * (1 - elementalResistance(element) / 100)) {
              throw `Could not achieve enough ${element} resistance for ${menuItem.item}.`;
            }
          }
          consumeSafe(countToConsume, menuItem.item);
        } else if ([Mayo.flex, Mayo.zapine].includes(menuItem.item)) {
          MayoClinic.setMayoMinder(menuItem.item, countToConsume);
        } else if (menuItem.item === $item`pocket wish`) {
          acquire(1, $item`pocket wish`, 60000);
          cliExecute(`genie effect ${menuItem.effect}`);
        } else if (menuItem.item === $item`Rethinking Candy`) {
          synthesize(countToConsume, $effect`Synthesis: Greed`);
        } else if (getClanLounge()[`${menuItem.item}`] && itemType(menuItem.item) === "booze") {
          cliExecute(`drink ${menuItem.item}`);
        } else if (menuItem.item === $item`campfire hot dog`) {
          // mafia does not support retrieveItem on campfire hot dog because it does not work on stick of firewood
          if (!have($item`stick of firewood`)) {
            buy(1, $item`stick of firewood`, garboValue($item`stick of firewood`));
          }
          consumeSafe(countToConsume, menuItem.item);
        } else if (menuItem.item !== $item`Special Seasoning`) {
          consumeSafe(countToConsume, menuItem.item, menuItem.additionalValue);
        }
      }
      dietEntry.quantity -= countToConsume;
    }
  }
}

export function runDiet(): void {
  withVIPClan(() => {
    if (myFamiliar() === $familiar`Stooper`) {
      useFamiliar($familiar`none`);
    }

    const dietBuilder = computeDiet();

    if (globalOptions.simulateDiet) {
      print("===== SIMULATED DIET =====");
      if (!get("_mimeArmyShotglassUsed") && have($item`mime army shotglass`)) {
        printDiet(dietBuilder.shotglass(), "SHOTGLASS");
      }
      printDiet(dietBuilder.diet(), "FULL");
    } else {
      pillCheck();

      nonOrganAdventures();

      if (have($item`astral six-pack`)) {
        use($item`astral six-pack`);
      }
      if (!get("_mimeArmyShotglassUsed") && have($item`mime army shotglass`)) {
        consumeDiet(dietBuilder.shotglass(), "SHOTGLASS");
      }

      if (
        get("barrelShrineUnlocked") &&
        !get("_barrelPrayer") &&
        $classes`Turtle Tamer, Accordion Thief`.includes(myClass())
      ) {
        cliExecute("barrelprayer buff");
      }

      consumeDiet(dietBuilder.diet(), "FULL");
    }
  });
}
