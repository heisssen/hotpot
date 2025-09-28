# Hotpot! – a Daggerheart Module for FoundryVTT

Hotpot add the mechanics of the Beast Feast Frame to be able to play on the Daggerheart system.

## Features

- **Ingredients**
  
  >_From the Dungeon to the Table._
  
  A new item subtype, Ingredients, has been added to the system and can now be tracked directly from the character sheet.

- **Making a Feast!**
  
  >_[Serves everyone the same, nondescript slop] For the appetizer, Caesar salad, escargot, and your Oriental spring rolls._
  
   The module allows you to create Hotpots and manage the feasts

- **Cookbook** (moderately implemented)
  
  >_It is our job to follow the recipe._
  
  Save and reference past recipes, including flavor profiles, meal names, and descriptions on Journals.

## Installation

You can manually install the module by following these steps:

1. Inside Foundry, select the Game Modules tab in the Configuration and Setup menu
2. Click the Install Module button and enter the following URL:

```
https://github.com/hotpot-daggerheart/releases/latest/download/module.json
```

3. Click Install and wait for installation to complete.

## Usage Instructions

1. Collect Ingredients
   Players collect **ingredients** (items) on their actor sheets as they explore dungeons and complete adventures.
2. Make a Feast
   During downtime, the GM runs the next command on a script macro: `HOTPOT.api.startFeast()` to begin the cooking process.
3. Contribute ingredients
   In the **Ingredient Step**, players drag ingredients from their actor sheets into the recipe to contribute them to the feast.
4. Name and describe the dish
   In the **Record Step**, the group decides on the dish’s name and description, and selects the journal where the recipe will be saved.
5. Roll Flavor Dice (see next point)
   In the **Roll Step**, the module automatically assembles the dice pool based on the contributed ingredients.
   The GM manages the rolls, discards dice when necessary, and can spend tokens to preserve the dice pool.
6. Finish the Feast
   Once cooking is complete, the **Meal Rating** now represents the group's total recovery value.
   Click the button to the right of the Tokens to record the recipe in the journal and close the application.

### Roll Workflow

1. The GM clicks the Roll button in the Current Pool section, and all dice in the current pool are rolled at once.
2. Check for Matches: Look at the results in the center panel, it shows the matched dice as shiny and the others as dull.
3. Collect Matched Dice: Click the arrow-right-bracket icon next to Matched Dice to collect the matches.
   The result total is automatically added to the Meal Rating. And the dice are removed from the Current Pool.
4. If a roll produces no matches, you must remove a die or spend a token:
   - Remove a Die: Manually lower the count of one die in the Current Pool.
   - Spend a Token: Discount a token instead of discarding a die.
     After discarding or spending, click Roll again to continue.
5. With the remaining dice still in the Current Pool, click Roll again.
   Repeat steps 2–4 until only you’re done cooking.
