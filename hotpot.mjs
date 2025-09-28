const CONSTANTS = foundry.utils.deepFreeze({
  MODULE_ID: "hotpot-daggerheart",
  TEMPLATE_PATH: "modules/hotpot-daggerheart/templates",
  STEPS: [{
    index: 0,
    label: "Select Ingredients",
    id: "ingredients",
    icon: "fa-solid fa-kitchen-set",
  },
  {
    index: 1,
    label: "Record Recipe",
    id: "record",
    icon: "fa-solid fa-book-bookmark",
  },
  {
    index: 2,
    label: "Roll Flavor",
    id: "roll",
    icon: "fa-solid fa-dice",
  }],
  queries: {
    updateHotpotAsGm: "hotpot-daggerheart.updateHotpotAsGm"
  },
  JOURNAL_FLAGS: {
    CATEGORY: "isRecipeCategory",
    FLAVORS: "flavorProfile",
  }
});

class IngredientModel extends foundry.abstract.TypeDataModel {
  static get metadata() {
    return {
      label: "Ingredient",
      labelPlural: "Ingredients",
      type: `${CONSTANTS.MODULE_ID}.ingredient`,
      isInventoryItem: true
    };
  }

  /**
   * @import {CONFIG}
   */
  get metadata() {
    return IngredientModel.metadata;
  }

  /**@override */
  static defineSchema() {
    const { HTMLField, TypedObjectField, NumberField, SchemaField } = foundry.data.fields;
    return {
      description: new HTMLField({ required: true, nullable: true }),
      flavors: new TypedObjectField(new SchemaField({
        strength: new NumberField({ initial: 1, min: 1, max: 3 }),
      }), {
        validateKey: (k) => Object.keys(CONFIG.HOTPOT.flavors).includes(k)
      }),
      quantity: new NumberField({ integer: true, initial: 1, positive: true, required: true }),
    }
  }

  /**@inheritdoc */
  prepareBaseData() {
    super.prepareBaseData();

    for (const [k, v] of Object.entries(this.flavors)) {
      const cfg = CONFIG.HOTPOT.flavors[k];
      this.flavors[k] = {
        strength: v.strength ?? 0,
        label: game.i18n.localize(cfg.label),
        dieFace: cfg.dieFace,
      };
    }


  }

  /**
  * The default icon used for newly created Item documents
  * @type {string}
  */
  static DEFAULT_ICON = null;
}

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @typedef {import("@client/applications/_types.mjs").ApplicationFormSubmission} ApplicationFormSubmission
 * @typedef {import("@client/applications/_types.mjs").ApplicationConfiguration} ApplicationConfiguration
 * @typedef {import("@client/applications/_types.mjs").ApplicationClickAction} ApplicationClickAction
 * @typedef {import("@client/applications/_types.mjs").ApplicationRenderOptions} ApplicationRenderOptions
 * @typedef {import("@client/applications/_types.mjs").ApplicationRenderContext} ApplicationRenderContext 
 * @typedef {import("@client/applications/api/handlebars-application.mjs").HandlebarsTemplatePart} HandlebarsTemplatePart
 * @typedef {import("@client/applications/api/handlebars-application.mjs").HandlebarsRenderOptions} HandlebarsRenderOptions 
 */

/**
 * @extends {foundry.applications.api.DocumentSheetV2}
 * @mixes foundry.applications.api.HandlebarsApplicationMixin
 */
class HotpotConfig extends HandlebarsApplicationMixin(DocumentSheetV2) {
  /**@type {ApplicationConfiguration} */
  static DEFAULT_OPTIONS = {
    classes: ["hotpot", "hotpot-config", "daggerheart", "dh-style", "dialog"],
    window: {
      title: "Hotpot!",
      icon: "fa-solid fa-bowl-food",
      resizable: true,
    },
    position: {
      width: 560,
      height: 530,
    },
    form: {
      submitOnChange: true,
    },
    actions: {
      nextStep: HotpotConfig.#onNextStep,
      previousStep: HotpotConfig.#onPreviousStep,
      modifyItemQuantity: HotpotConfig.#onModifyItemQuantity,
      removeIngredient: HotpotConfig.#onRemoveIngredient,
      collectMatched: HotpotConfig.#onCollectMatched,
      rollFlavor: HotpotConfig.#onRollFlavor,
      finishHotpot: HotpotConfig.#onFinishHotpot,
    },
  };

  /**@type {Record<string, HandlebarsTemplatePart>} */
  static PARTS = {
    header: {
      template: `${CONSTANTS.TEMPLATE_PATH}/hotpot-config/header.hbs`,
    },
    ingredients: {
      template: `${CONSTANTS.TEMPLATE_PATH}/hotpot-config/ingredients.hbs`,
      scrollable: [".scrollable"]
    },
    record: {
      template: `${CONSTANTS.TEMPLATE_PATH}/hotpot-config/record.hbs`,
      scrollable: [".scrollable"]
    },
    roll: {
      template: `${CONSTANTS.TEMPLATE_PATH}/hotpot-config/roll.hbs`,
      scrollable: [".scrollable"]
    },
  }

  /* -------------------------------------------- */

  /**@inheritdoc */
  _initializeApplicationOptions(options) {
    const initialized = super._initializeApplicationOptions(options);
    initialized.classes = initialized.classes.filter(cls => cls !== "sheet");
    initialized.window.controls = [];
    return initialized;
  }

  /** @override */
  get title() {
    return game.i18n.localize(this.options.window.title);
  }

  /** @override */
  _canRender(_options) {
    return !this.document.completed;
  }

  /**@override */
  get isEditable() {
    if (this.document.pack) {
      const pack = game.packs.get(this.document.pack);
      if (pack.locked) return false;
    }
    return true;
  }

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    Object.values(this.document.system.ingredients).forEach(i => i.document.apps[this.id] = this);
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    new foundry.applications.ux.DragDrop.implementation({
      dropSelector: ".ingredients-section",
      callbacks: {
        drop: this._onDrop.bind(this)
      }
    }).bind(this.element);

    this._addDiceHoverListener();
  }

  /** @inheritDoc */
  _onClose(options) {
    super._onClose(options);
     Object.values(this.document.system.ingredients).forEach(i => delete i.document.apps[this.id]);
  } 

  /**
   * Handle mouse-in and mouse-out events on a dice.
   * @param {PointerEvent} event
   */
  _addDiceHoverListener() {
    const selector = ".dice";
    this.element.querySelectorAll(selector).forEach(div => {
      div.addEventListener("mouseover", (event) => {
        const target = event.currentTarget;
        const { result } = target.dataset;

        target.closest(".dice-pool")
          .querySelectorAll(`${selector}[data-result="${result}"]`)
          .forEach(die => die.classList.add("hovered"));
      });

      div.addEventListener("mouseout", (event) => {
        const target = event.currentTarget;
        const { result } = target.dataset;

        target.closest(".dice-pool")
          .querySelectorAll(`${selector}[data-result="${result}"]`)
          .forEach(die => die.classList.remove("hovered"));
      });
    });
  }

  /**
   * An event that occurs when data is dropped into a drop target.
   * @param {DragEvent} event
   * @returns {Promise<void>}
   * @protected
   */
  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);

    // Dropped Documents
    const documentClass = foundry.utils.getDocumentClass(data.type);
    if (!documentClass) return

    const { collection, embedded } = foundry.utils.parseUuid(data.uuid);
    if (collection instanceof foundry.documents.collections.CompendiumCollection) return ui.notifications.warn("The document must exist in the world, it is not a compendium");
    if (!embedded.length) return ui.notifications.warn("may not be an embedded document");

    const doc = await documentClass.fromDropData(data);
    if (doc.type !== IngredientModel.metadata.type) return;

    return this.#submitUpdate({
      [`system.ingredients.${doc.id}`]: {
        uuid: doc.uuid,
        quantity: 1,
      }
    });
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  get currentStep() { return this.document.system.currentStep; }
  get previousStep() { return this.document.system.previousStep; }
  get nextStep() { return this.document.system.nextStep; }

  /**@inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.status = {
      currentStep: this.currentStep,
      previousStep: this.previousStep,
      nextStep: this.nextStep,
    };

    context.ingredients = Object.values(this.document.system.ingredients).sort((a, b) => {
      if (a.document.isOwner && !b.document.isOwner) return -1;
      if (b.document.isOwner && !a.document.isOwner) return 1;
      const parentSort = a.document.parent.name.localeCompare(b.document.parent.name);
      if (parentSort !== 0) return parentSort;
      return a.document.name.localeCompare(b.document.name);
    });

    context.isGM = game.user.isGM;

    return context;
  }

  /**@inheritdoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    context.step = {
      ...CONSTANTS.STEPS.find(({ id }) => id === partId),
      class: `${partId}${this.currentStep.id === partId ? " active" : ""}`,
    };

    switch (partId) {
      case "header":
        await this._prepareHeaderContext(context, options);
        break;
      case "roll":
        await this._prepareRollContext(context, options);
        break;
      case "record":
        await this._prepareRecordContext(context, options);
        break
    }
    return context;
  }

  /**
   * 
   * @param {ApplicationRenderContext} context 
   * @param {HandlebarsRenderOptions} options 
   */
  async _prepareHeaderContext(context, _options) {
    const { currentStep, previousStep, nextStep } = this;

    const getClasses = (stepIndex) => {
      if (stepIndex === currentStep.index) return ["active"];
      if (stepIndex < currentStep.index) return ["completed"];
      return ["inactive"];
    };

    context.steps = CONSTANTS.STEPS.map((s) => {
      const classes = getClasses(s.index);
      let action;
      if (s.index === previousStep?.index) action = "previousStep";
      else if (s.index === nextStep?.index) action = "nextStep";
      if (action && this.document.isOwner) classes.push("clickable");

      return { ...s, classes: classes.join(" "), action };
    });
  }

  /**
   * 
   * @param {ApplicationRenderContext} context 
   * @param {HandlebarsRenderOptions} options 
   */
  async _prepareRollContext(context, _options) {
    const { dicePool, currentPool, matchedDice } = this.document.system;

    context.dice = dicePool;
    context.dicePoolIsEmpty = !Object.values(currentPool).some(v => v > 0);
    context.matchedDice = matchedDice;
    context.totalMatch = Object.keys(matchedDice).reduce((acc, k) => acc += Number(k), 0);
  }

  async _prepareRecordContext(context, _options) {
    /**@type {HotpotMessageData} */
    const { schema, recipe } = this.document.system;
    const { TextEditor } = foundry.applications.ux;

    context.journal = {
      field: schema.getField("recipe.journal"),
      value: recipe.journal,
    };

    context.description = {
      field: schema.getField("recipe.description"),
      value: recipe.description,
      enriched: await TextEditor.implementation.enrichHTML(recipe.description, {
        relativeTo: this.document,
        secrets: game.user.isGM,
      })
    };
  }

  /* -------------------------------------------- */
  /*  Form Submit Handlers                        */
  /* -------------------------------------------- */

  /** @inheritdoc*/
  async _processSubmitData(event, form, submitData, options = {}) {
    if (this.document.isOwner) return await super._processSubmitData(event, form, submitData, options);
    const gm = game.users.activeGM;
    if (!gm) return;

    return gm.query(CONSTANTS.queries.updateHotpotAsGm, {
      messageId: this.document.id,
      data: updateData,
    });
  }

  /**
   * Submit an update to this document.
   * @param {Object} updateData - The data changes to apply.
   * @returns {Promise<foundry.abstract.Document|void>} The updated document if local, or nothing if handled by a GM.
   */
  #submitUpdate(updateData) {
    if (this.document.isOwner) return this.document.update(updateData);

    const gm = game.users.activeGM;
    if (!gm) return;

    return gm.query(
      CONSTANTS.queries.updateHotpotAsGm,
      {
        messageId: this.document.id,
        data: updateData,
      });
  }

  /* -------------------------------------------- */
  /*  Application Click Handlers                  */
  /* -------------------------------------------- */

  /**
   * @type {ApplicationClickAction}
   * @this HotpotConfig
   */
  static async #onNextStep() {
    if (this.document.isOwner) return await this.document.system.moveStep(1);
  }

  /**
   * @type {ApplicationClickAction}
   * @this HotpotConfig
   */
  static async #onPreviousStep(event) {
    if (!this.document.isOwner) return;
    const { DialogV2 } = foundry.applications.api;
    if (!event.shiftKey) {
      const confirm = await DialogV2.confirm({
        window: { title: "Previous Step" },
        content: "<p>Return to a previous step? This could reset some fields.</p>"
      });
      if (!confirm) return;
    }
    return await this.document.system.moveStep(-1);
  }

  /**
   * @type {ApplicationClickAction}
   * @this HotpotConfig
   */
  static #onModifyItemQuantity(_, target) {
    const addend = target.dataset.modification === "increase" ? 1 : -1;
    const { itemId } = target.closest("[data-item-id]").dataset;
    if (!itemId) return;
    const { quantity, document } = this.document.system.ingredients[itemId];
    const newQty = Math.clamp(quantity + addend, 1, document.system.quantity);
    return this.#submitUpdate({ [`system.ingredients.${itemId}.quantity`]: newQty });
  }

  /**
   * @type {ApplicationClickAction}
   * @this HotpotConfig
   */
  static #onRemoveIngredient(_, target) {
    const { itemId } = target.closest("[data-item-id]").dataset;
    if (!itemId) return;
    return this.#submitUpdate({ [`system.ingredients.-=${itemId}`]: null });
  }

  /**
   * @type {ApplicationClickAction}
   * @this HotpotConfig
   */
  static async #onCollectMatched() {
    const { dicePool, currentPool, mealRating, matchedDice } = this.document.system;

    const newPool = dicePool.reduce((acc, d) => ({ ...acc, [`d${d.faces}`]: Math.max(0, currentPool[`d${d.faces}`] - d.results.filter(r => r.matched).length) }), {});
    const newTotal = mealRating + Object.keys(matchedDice).reduce((acc, k) => acc += Number(k), 0);

    return await this.document.update({
      "system.currentPool": newPool,
      "system.mealRating": newTotal,
    });
  }

  /**
   * @type {ApplicationClickAction}
   * @this HotpotConfig
   */
  static async #onRollFlavor() {
    const { Die } = foundry.dice.terms;
    const { currentPool } = this.document.system;

    /**@type {Promise<foundry.dice.terms.Die>[]} */
    const diceTerms = Object.entries(currentPool)
      .filter(([_, v]) => v > 0)
      .map(([k, v]) => new Die({ number: v, faces: Number(k.slice(1)) }).evaluate());
    const dice = await Promise.all(diceTerms);

    return await this.document.update({ "system.dicePool": dice.map(d => d.toJSON()) });
  }

  /**
   * @type {ApplicationClickAction}
   * @this HotpotConfig
   */
  static async #onFinishHotpot() {
    if (!game.user.isGM) return;
    /**@type {HotpotMessageData} */
    const system = this.document.system;
    const { recipe } = system;

    if (recipe.journal) await system._createJournal();

    await this.document.update({ "system.completed": true });

    return await this.close();
  }

}

/**
 * Convert a module namespace into a plain object.
 * Strips off default exports and meta-properties.
 *
 * @param {object} module - The imported module namespace.
 * @param {boolean} [includeDefault=false] - Whether to keep the default export.
 * @returns {object} A plain object with only named exports.
 */
function moduleToObject(module, includeDefault = false) {
  const obj = {};
  for (const [key, value] of Object.entries(module)) {
    if (key === "default" && !includeDefault) continue;
    obj[key] = value;
  }
  return obj;
}

/**
 * 
 * @param {foundry.utils.Collection} collection 
 * @param {String} flagKey 
 * @returns {foundry.abstract.Document[]}
 */
function findDocByFlag(collection, flagKey, { multiple = false } = {}) {
  const hasFlag = doc => !!doc.getFlag(CONSTANTS.MODULE_ID, flagKey);
  if (multiple) {
    const results = collection.filter(hasFlag);
    return results.length ? results : [];
  } else {
    return collection.find(hasFlag) ?? null;
  }
}

/**
 * @typedef DieData
 * @property {number|foundry.dice.Roll} [number = 1] - The number of dice of this term to roll, before modifiers are applied, or a Roll instance that will be evaluated to a number.
 * @property {number|foundry.dice.Roll} [faces = 1] - The number of faces on each die of this type, or a Roll instance that will be evaluated to a number.
 * @property {string} method - The resolution method used to resolve DiceTerm.
 * @property {string[]} [modifiers] - An array of modifiers applied to the results
 * @property {import("@client/dice/_types.mjs").DiceTermResult[]} results - An optional array of pre-cast results for the term
 * @property {boolean} [evaluated] - An internal flag for whether the term has been evaluated
 * @property {Object} options - Additional options that modify the term
 */

/**
 * Hotpot Message Data model.
 */
class HotpotMessageData extends foundry.abstract.TypeDataModel {
  /**
   * Metadata definition for this DataModel.
   */
  static get metadata() {
    return {
      type: `${CONSTANTS.MODULE_ID}.hotpot`,
      template: `${CONSTANTS.TEMPLATE_PATH}/chat-message/hotpot.hbs`,
      actions: {
        openHotpot: HotpotMessageData.#onOpenHotpot,
      }
    }
  }

  /**
   * Template to use when rendering this message.
   * @type {string}
   */
  get template() {
    return HotpotMessageData.metadata.template;
  }

  /**@type {foundry.documents.ChatMessage} */
  get #document() {
    return this.parent;
  }

  /**@override */
  static defineSchema() {
    const { TypedObjectField, SchemaField, DocumentUUIDField, StringField, NumberField, BooleanField, ArrayField, HTMLField, ObjectField, ForeignDocumentField } = foundry.data.fields;
    return {
      recipe: new SchemaField({
        name: new StringField({ initial: "New Recipe" }),
        description: new HTMLField(),
        journal: new ForeignDocumentField(foundry.documents.BaseJournalEntry, { required: true }),
      }),
      completed: new BooleanField({ gmOnly: true }),
      ingredients: new TypedObjectField(new SchemaField({
        uuid: new DocumentUUIDField({ embedded: true, type: "Item", blank: false, }),
        quantity: new NumberField({ initial: 1, integer: true, nullable: false, required: true })
      })),
      currentPool: new SchemaField(
        Object.values(CONFIG.HOTPOT.flavors).reduce((acc, v) => {
          acc[`d${v.dieFace}`] = new NumberField({ initial: 0, integer: true, nullable: false, required: true });
          return acc;
        }, {})),
      mealRating: new NumberField({ integer: true, initial: 0, nullable: false, required: true }),
      dicePool: new ArrayField(new ObjectField({ validate: (v) => v._evaluated, validationError: "Must be a evaluated Die" })),
      tokens: new NumberField({ initial: 0, nullable: false, integer: true, min: 0 }),
      step: new NumberField({ initial: 0, min: 0, max: CONSTANTS.STEPS.length - 1 }),
    }
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /**@override */
  prepareBaseData() {
    for (const ingredient of Object.values(this.ingredients)) {
      ingredient.document ??= foundry.utils.fromUuidSync(ingredient.uuid);
    }

    /**@type {foundry.dice.terms.Die[]} */
    this.dicePool = this.dicePool.map(d => new foundry.dice.terms.Die(d));
    this.matchedDice = this.dicePool.flatMap(die =>
      die.results
        .filter(r => r.matched)
        .map(r => ({ faces: die.faces, result: r.result }))
    ).reduce((acc, r) => {
      if (!acc[r.result]) acc[r.result] = [];
      acc[r.result].push(r.faces);
      return acc;
    }, {});

  }

  /**
 * Compute the total flavor strengths dynamically based on prepared ingredient documents.
 *
 * @type {Record<string, {strength:number}>}
 */
  get totals() {
    const totals = foundry.utils.duplicate(CONFIG.HOTPOT.flavors);
    Object.values(totals).forEach(f => f.strength = 0);

    for (const ingredient of Object.values(this.ingredients)) {
      const doc = ingredient.document;
      if (!doc) continue;

      const qty = ingredient.quantity ?? 1;
      for (const [key, { strength = 0 }] of Object.entries(doc.system.flavors)) {
        if (totals[key]) totals[key].strength += strength * qty;
      }
    }

    return totals;
  }

  /**
   * Party’s tier.
   * @returns {Number}
   */
  get partyTier() {
    const actors = Object.values(this.ingredients).map(i => i.document.actor);
    const tiers = new Set(actors).reduce((acc, a) => [...acc, a.system.tier], []);
    return Math.max(1, Math.min(...tiers));
  }
  /* -------------------------------------------- */
  /*  Step Logic                                  */
  /* -------------------------------------------- */

  /**
   * The current step name.
   * @returns {Object}
   */
  get currentStep() {
    return CONSTANTS.STEPS[this.step] ?? null;
  }

  /**
 * Previous step name
 * @returns {Object}
 */
  get previousStep() {
    return this.step > 0 ? CONSTANTS.STEPS[this.step - 1] : null;
  }

  /**
   * Next step name
   * @returns {Object}
   */
  get nextStep() {
    return this.step < CONSTANTS.STEPS.length - 1
      ? CONSTANTS.STEPS[this.step + 1]
      : null;
  }


  /**
   * Move the current step forward or backward in the step list.
   * Emits a socket event and re-renders if the new index is valid.
   *
   * @param {number} delta - The number of steps to move
   */
  async moveStep(delta) {
    const newIndex = this.step + delta;
    if (!Number.isInteger(newIndex) || !CONSTANTS.STEPS[newIndex]) return;
    return await this.#document.update({ "system.step": newIndex });
  }

  /* -------------------------------------------- */
  /*  Hotpot Logic                                */
  /* -------------------------------------------- */

  /**
   * Get the number of tokens.
   * @returns {number}
   */
  _getTokenInitials() {
    const { FLAVORS } = CONSTANTS.JOURNAL_FLAGS;
    const { objectsEqual } = foundry.utils;

    const recipeJournal = this.recipe?.journal;
    if (!recipeJournal) return 0;

    const storedRecipePages = findDocByFlag(recipeJournal.pages, FLAVORS, { multiple: true });
    const currentFlavorProfile = Object.fromEntries(Object.entries(this.totals).map(([k, v]) => [k, v.strength]));
    const hasMatchingProfile = storedRecipePages.some(p => objectsEqual(currentFlavorProfile, p.getFlag(CONSTANTS.MODULE_ID, FLAVORS)));

    return hasMatchingProfile ? this.partyTier ?? 0 : 0;
  }

  /**
   * Process duplicate results in dice and mark them as active if repeated.
   * @param {foundry.dice.terms.Die[]} dice 
   */
  _processMatches(dice) {
    const allResults = dice.flatMap(die => die.results.map(r => r.result));

    const counts = allResults.reduce((acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});

    for (const die of dice) {
      for (const res of die.results) {
        res.matched = counts[res.result] > 1;
      }
    }
  }

  /**
   * Creates (if necessary) a journal category and a journal entry page
   * in the journal specified in the recipe.
   * @returns {Promise<foundry.documents.JournalEntryPage|void>}
   */
  async _createJournal() {
    const { JournalEntryPage } = foundry.documents;
    const { journal, name, description } = this.recipe;
    if (!journal) return;

    const category = findDocByFlag(journal.categories, CONSTANTS.JOURNAL_FLAGS.CATEGORY) ?? await this.#createCategory(journal);

    const flavorProfile = Object.fromEntries(
      Object.entries(this.totals).map(([k, v]) => [k, v.strength])
    );

    const flavorProfileText = `<h2>Flavor Profile</h2> ${Object.values(this.totals).map(v => `<p>${v.label}(d${v.dieFace}): ${v.strength}</p>`).join("")}`;
    return JournalEntryPage.implementation.create({
      name,
      "text.content": description + flavorProfileText,
      category: category._id,
      [`flags.${CONSTANTS.MODULE_ID}.${CONSTANTS.JOURNAL_FLAGS.FLAVORS}`]: flavorProfile
    }, { parent: journal });
  }

  /**
   * Creates a new "Hotpot Recipes" category in the given journal.
   * @param {foundry.documents.JournalEntry} parent he journal where the category will be created.
   * @returns {Promise<foundry.documents.JournalEntryCategory>}
   */
  async #createCategory(parent) {
    const { JournalEntryCategory } = foundry.documents;
    const categories = parent.categories.contents ?? [];

    return JournalEntryCategory.implementation.create({
      name: "Hotpot Recipes",
      sort: (categories.length + 1) * CONST.SORT_INTEGER_DENSITY,
      [`flags.${CONSTANTS.MODULE_ID}.${CONSTANTS.JOURNAL_FLAGS.CATEGORY}`]: true
    }, { parent });
  }



  /* -------------------------------------------- */
  /*  Lifecycle Methods                           */
  /* -------------------------------------------- */

  /**
   * @param {foundry.documents.types.ChatMessageData} data 
   * @returns {foundry.documents.ChatMessage}
   */
  static async create(data = {}) {
    if(!game.user.isGM) return;
    const cls = foundry.documents.ChatMessage;

    /**@type {foundry.documents.types.ChatMessageData} */
    const createData = foundry.utils.mergeObject(data, {
      type: HotpotMessageData.metadata.type,
      "system.step": 0,
    }, { inplace: false });

    return await cls.create(createData)
  }

  /**
   * 
   * @param {import("@common/documents/_types.mjs").ChatMessageData} data - The initial data object provided to the document creation request
   * @param {Object} options - Additional options which modify the creation request
   * @param {foundry.documents.User} user - The id of the User requesting the document update
   * @inheritdoc
   */
  async _preCreate(data, options, user) {
    data.content = await this.render(options);
  }

  /** @inheritDoc */
  async _preUpdate(changed, options, user) {
    const { hasProperty } = foundry.utils;

    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;

    if ("system" in changed) {
      if (hasProperty(changed, "system.dicePool")) await this._prepareDiePoolUpdate(changed.system.dicePool);
      if (hasProperty(changed, "system.step")) await this._prepareStepUpdate(changed);
      if (hasProperty(changed, "system.ingredients")) await this._prepareIngredientsUpdate(changed);

      options.context = { system: changed.system };
      changed.content = await this.render(options);
    }
  }

  /**
   * Normalize and evaluate all dice in a system's dice pool.
   * @param {Array<foundry.dice.terms.Die|Object>} dicePool - The dice pool to process.
   * @returns {Promise<void>} Resolves once all dice have been evaluated and converted to JSON.
   * @async
   */
  async _prepareDiePoolUpdate(dicePool) {
    const { Die } = foundry.dice.terms;
    dicePool = await Promise.all(dicePool.map(async die => {

      if (!(die instanceof Die)) die = new Die(die);
      if (!die._evaluated) await die.evaluate();
      return die.toJSON();
    }));

    this._processMatches(dicePool);
  }

  /**
   * Normalize and evaluate all dice in a system's dice pool.
   * @param {Number} step - .
   * @returns {Promise<void>} Resolves once all dice have been evaluated and converted to JSON.
   * @async
   */
  async _prepareStepUpdate(changed) {
    const STEPS = Object.fromEntries(CONSTANTS.STEPS.map(step => [step.id, step.index]));
    const goingForward = changed.system.step > this.step;
    if (goingForward) {
      switch (changed.system.step) {
        case STEPS.roll:
          changed.system.dicePool ??= [];
          changed.system.mealRating ??= 0;
          changed.system.currentPool ??= Object.fromEntries(Object.values(this.totals).map(v => [`d${v.dieFace}`, v.strength]));
          changed.system.tokens ??= this._getTokenInitials();
          break;
      }
    }
  }

  async _prepareIngredientsUpdate(changed) {
    const { hasProperty, isDeletionKey, deleteProperty, fromUuidSync } = foundry.utils;

    // Find the active HotpotConfig app
    const app = Object.values(this.#document.apps).find(a => a instanceof HotpotConfig);
    if (!app) return;

    for (const [key, ingredient] of Object.entries(changed.system.ingredients)) {
      // Handle deletion
      if (ingredient === null && isDeletionKey(key)) {
        deleteProperty(this.ingredients[key.slice(2)]?.document.apps, app.id);
        continue;
      }

      // Handle addition
      if (ingredient && !hasProperty(this.ingredients, key)) {
        const doc = fromUuidSync(ingredient.uuid);
        doc.apps[app.id] = app;
      }
    }
  }


  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
 * Render the contents of this chat message.
 * @param {object} options  Rendering options.
 * @returns {Promise<string>}
 */
  async render(options) {
    if (!this.template) return "";
    return foundry.applications.handlebars.renderTemplate(this.template, await this._prepareContext(options));
  }

  /**
 * Prepare application rendering context data for a given render request.
 * @param {object} options  Rendering options.
 * @returns {Promise<ApplicationRenderContext>}   Context data for the render operation.
 * @protected
 */
  async _prepareContext(options) {
    const system = foundry.utils.mergeObject(this, options?.context?.system ?? {}, { inplace: false });
    const getClasses = (stepIndex) => {
      if (this.completed) return ["completed"];
      if (stepIndex === system.step) return ["active"];
      if (stepIndex < system.step) return ["completed"];
      return ["inactive"];
    };

    const steps = CONSTANTS.STEPS.map((s) => {
      const classes = getClasses(s.index).join(" ");
      return { ...s, classes };
    });

    return {
      system,
      steps,
    };
  }

  /* -------------------------------------------- */
  /*  Hook Callback Handler                       */
  /* -------------------------------------------- */

  /**
   * Add event listeners to the Hotpot Message Data.
   * @param {foundry.documents.ChatMessage} chatMessage 
   * @param {HTMLElement} html 
   * @param {Object} messageData 
   */
  static onRenderChatMessageHTML(chatMessage, html, messageData) {
    if (chatMessage.type !== HotpotMessageData.metadata.type) return;

    html.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", (event) => {
        const target = event.currentTarget;
        const { action } = target.dataset;
        const fn = HotpotMessageData.metadata.actions[action];
        if (fn instanceof Function) fn.call(chatMessage.system, event, target);
      });

    });
  }

  /* -------------------------------------------- */
  /*  Click Callbacks                             */
  /* -------------------------------------------- */

  /**
   * @type {ApplicationClickAction}
   * @this {HotpotMessageData}
   */
  static #onOpenHotpot() {
    const app = new HotpotConfig({ document: this.#document });
    app.render({ force: true });
  }

}

var data = /*#__PURE__*/Object.freeze({
  __proto__: null,
  HotpotMessageData: HotpotMessageData,
  IngredientModel: IngredientModel
});

/**
 * Factory function that creates a custom Item Sheet for ingredients.
 * This function is only because system classes are not exposed globally before init
 * @function createIngredientSheet
 * @returns {typeof foundry.applications.sheets.ItemSheetV2}
 */
function createIngredientSheet() {
  /**@type {foundry.applications.sheets.ItemSheetV2}} */
  const BaseItemSheet = game.system.api.applications.sheets.api.DHBaseItemSheet;

  /**
   * @extends foundry.applications.sheets.ItemSheetV2
   */
  class IngredientSheet extends BaseItemSheet {
    /**@inheritdoc */
    static DEFAULT_OPTIONS = {
      classes: ['ingredient', "hotpot"],
      position: { width: 550 },
      actions: {
        addFlavor: IngredientSheet.#onAddFlavor
      },
      contextMenus: [
        {
          handler: IngredientSheet.#getFlavorContextOptions,
          selector: "[data-flavor]",
          options: { parentClassHooks: false, fixed: true }
        }
      ]
    };

    /**@override */
    static TABS = {}

    /**@override */
    static PARTS = {
      header: { template: `${CONSTANTS.TEMPLATE_PATH}/ingredient-sheet/header.hbs` },
      main: { template: `${CONSTANTS.TEMPLATE_PATH}/ingredient-sheet/main.hbs` }
    };

    /**@inheritdoc */
    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      context.flavorChoices = [{ key: "" },
      ...Object.entries(CONFIG.HOTPOT.flavors)
        .map(([key, v]) => ({ key, label: `${v.label} (d${v.dieFace})` }))
        .filter(f => !Object.keys(this.item.system.flavors).includes(f.key))];

      context.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(this.item.system.description, {
        relativeTo: this.item,
        rollData: this.item.getRollData(),
        secrets: this.item.isOwner
      });

      return context;
    }

    /* -------------------------------------------- */
    /*  Context Menu                                */
    /* -------------------------------------------- */

    /**
   * Get the set of ContextMenu options for Features.
   * @returns {import('@client/applications/ux/context-menu.mjs').ContextMenuEntry[]} - The Array of context options passed to the ContextMenu instance
   * @this {IngredientSheet}
   * @protected
   */
    static #getFlavorContextOptions() {
      return [{
        name: 'CONTROLS.CommonDelete',
        icon: '<i class="fa-solid fa-trash"></i>',
        callback: async target => {
          const { flavor } = target.closest("[data-flavor]").dataset;
          if (!flavor) return;
          await this.document.update({ [`system.flavors.-=${flavor}`]: null });
        }
      }]
    }


    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /**
     * 
     * @this {IngredientSheet}
     * @type {import("@client/applications/_types.mjs").ApplicationClickAction}
     */
    static async #onAddFlavor() {
      /**@type {HTMLSelectElement} */
      const select = this.element.querySelector(`[id="${this.id}-newFlavorType"]`);
      if (!select.value) return;
      return await this.item.update({
        [`system.flavors.${select.value}.strength`]: 1
      });
    }

  }

  return IngredientSheet;
}

var apps = /*#__PURE__*/Object.freeze({
  __proto__: null,
  HotpotConfig: HotpotConfig,
  createIngredientSheet: createIngredientSheet
});

/**
 * 
 * @param {foundry.applications.sheets.ActorSheetV2} application 
 * @param {HTMLElement} element 
 * @param {import("@client/applications/_types.mjs").ApplicationRenderContext} context 
 * @param {import("@client/applications/_types.mjs").ApplicationRenderOptions} options 
 */
function onRenderCharacterSheet(application, element, context, options) {
  const itemSection = element.querySelector(".tab.inventory .items-section");

  const template = Handlebars.partials["daggerheart.inventory-items"]({
    title: 'TYPES.Item.hotpot-daggerheart.ingredient',
    type: 'hotpot-daggerheart.ingredient',
    collection: application.actor.itemTypes["hotpot-daggerheart.ingredient"],
    isGlassy: true,
    canCreate: true,
    hideTooltip: true,
    hideResources: false,
    showActions: false,
    hideDescription: true,
  }, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true });

  const fieldsset = foundry.utils.parseHTML(template);
  fieldsset.classList.add("hotpot");
  fieldsset.querySelectorAll(".inventory-item").forEach(el => {
    el.ondragstart = /** @param {DragEvent} event */ (event) => {
      const { itemId } = event.target.dataset;
      if (!itemId) return;
      const item = application.actor.items.get(itemId);
      event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
    };
  });
  itemSection.appendChild(fieldsset);


  const syntheticEvent = { type: 'pointerdown', bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true, button: 0 };
  application._onMenuFilterInventory(syntheticEvent, itemSection, []);

  if (options.isFirstRender) {
    application._createContextMenu(
      () => application._getContextMenuCommonOptions.call(application, { usable: false, toChat: false }),
      "[data-item-uuid][data-type='hotpot-daggerheart.ingredient']",
      { parentClassHooks: false, fixed: true });
    fieldsset.querySelectorAll(".inventory-item-quantity").forEach(el => el.addEventListener("change", application.updateItemQuantity.bind(application)));
  }
}

var hooks = /*#__PURE__*/Object.freeze({
  __proto__: null,
  onRenderCharacterSheet: onRenderCharacterSheet
});

const { type } = HotpotMessageData.metadata;
const { isEmpty } = foundry.utils;

/**
 * Update a Foundry document as the GM.
 * @param {Object} params - Parameters for the update operation.
 * @param {string} params.messageId - The UUID of the document to update.
 * @param {Object} params.data - Differential update data which modifies the existing values of this document
 * @param {Partial<Omit<import("@common/abstract/_types.mjs").DatabaseUpdateOperation, "updates">>} [params.operation] - Parameters of the update operation
 * @returns {Promise<foundry.abstract.Document|undefined>} The updated document, or `undefined` if no update occurred.
 */
async function _onUpdateHotpotAsGm({ messageId, data, operation } = {}) {
  /**@type {foundry.documents.ChatMessage} */
  const doc = game.messages.get(messageId);

  if (
    isEmpty(data) ||
    doc?.type !== type ||
    doc?.system?.completed
  ) return;

  return await doc.update(data, operation);
}

var socket = /*#__PURE__*/Object.freeze({
  __proto__: null,
  _onUpdateHotpotAsGm: _onUpdateHotpotAsGm
});

const HOTPOT$1 = {
  flavors: {
    sweet: {
      label: "Sweet",
      dieFace: 4
    },
    salty: {
      label: "Salty",
      dieFace: 6
    },
    bitter: {
      label: "Bitter",
      dieFace: 8
    },
    sour: {
      label: "Sour",
      dieFace: 10
    },
    savory: {
      label: "Savory",
      dieFace: 12
    },
    weird: {
      label: "Weird",
      dieFace: 20
    },
  }
};

const { DocumentSheetConfig } = foundry.applications.apps;

foundry.utils.setProperty(
  globalThis,
  "HOTPOT",
  {
    data: moduleToObject(data, false),
    apps: moduleToObject(apps, false),
    socket: moduleToObject(socket, false),
    hooks: moduleToObject(hooks, false),
    api: {
      startFeast: HotpotMessageData.create,
    },
  }
);


Hooks.on("init", () => {
  const { data, socket, apps } = HOTPOT;

  CONFIG.HOTPOT = HOTPOT$1;

  CONFIG.Item.dataModels[data.IngredientModel.metadata.type] = data.IngredientModel;
  CONFIG.ChatMessage.dataModels[data.HotpotMessageData.metadata.type] = data.HotpotMessageData;
  CONFIG.queries[CONSTANTS.queries.updateHotpotAsGm] = socket._onUpdateHotpotAsGm;

  apps.IngredientSheet = apps.createIngredientSheet();

  DocumentSheetConfig.registerSheet(foundry.documents.Item, CONSTANTS.MODULE_ID, apps.IngredientSheet, {
    makeDefault: true,
    types: [data.IngredientModel.metadata.type],
  });
});

Hooks.on("renderCharacterSheet", onRenderCharacterSheet);
Hooks.on("renderChatMessageHTML", HotpotMessageData.onRenderChatMessageHTML);
