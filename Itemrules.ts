/*
╔══════════════════════════════════════════════════════════════╗
║                          ITEM RULES                          ║
║                                                              ║
║        Scan Items, Let One Rule Do Anything To Them          ║
╚══════════════════════════════════════════════════════════════╝
*/

type PlayerId = Parameters<typeof api.getItemSlot>[0];
type SetSlotArgs = Parameters<typeof api.setItemSlot>;

type Attrs = { customDisplayName?: string; customDescription?: string; customAttributes?: Record<string, any>; [key: string]: any };
type Item = { name: string; amount: number | null; attributes: Attrs };
type MatchInfo = Record<string, any>;
type MatchCtx = { playerId: PlayerId; slot: number; rule: string };
type Ctx = MatchCtx & { m: MatchInfo };
type Matcher = null | boolean | number | string | RegExp | ((value: any, item: Item) => any) | Matcher[];
type MatchFn = (item: Item, ctx: MatchCtx) => any;
type MatchSpec = string | RegExp | MatchFn | MatchSpec[] | Record<string, Matcher>;
type Action = (item: Item, ctx: Ctx) => void;
type ItemRule = {
    id?: string;
    match: MatchSpec;
    do: Action | Action[];
    chain?: boolean;
    once?: boolean | string;
};
type ApplyResult = {
    changed: boolean;
    removed: boolean;
    matched: string[];
    name?: string;
    amount?: number | null;
    attributes?: Attrs;
};

type SlotLike = { name: string; amount?: number | null; attributes?: Attrs };
type Compiled = {
    label: string;
    test: (item: Item, ctx: MatchCtx) => MatchInfo | null;
    names: string[] | null;
    actions: Action[];
    chain: boolean;
    once: string | undefined;
};

const RULE_KEYS = ["id", "match", "do", "chain", "once"];
const CONFIG_KEYS = ["firstSlot", "lastSlot", "tellClient"];
const ROOTS = ["name", "amount", "attributes"];
const BAD_SEGS = ["__proto__", "constructor", "prototype"];

const USE_ENCH = "Use keys like 'attributes.customAttributes.enchantments.<Enchant>' or a function match (item, ctx) => boolean.";
const USE_CUSTOM = "Use keys like 'attributes.customAttributes.<Key>' or a function match (item, ctx) => boolean.";
const USE_FN = "Use a function match (item, ctx) => boolean.";
const OLD_MATCH: Record<string, string> = {
    display: "Use the key 'attributes.customDisplayName'.",
    description: "Use the key 'attributes.customDescription'.",
    tier: "Use the key 'attributes.customAttributes.enchantmentTier'.",
    enchants: USE_ENCH,
    exactEnchants: USE_ENCH,
    hasEnchant: USE_ENCH,
    noEnchants: USE_FN,
    custom: USE_CUSTOM,
    exactCustom: USE_CUSTOM,
    hasCustom: USE_CUSTOM,
    noCustom: USE_FN,
    extra: "Use keys like 'attributes.<Key>'.",
    test: USE_FN
};

const cfg = { firstSlot: 0, lastSlot: 50, tellClient: true };
const rules: Compiled[] = [];
const ids: Record<string, boolean> = {};
const logged: Record<string, boolean> = {};

const logOnce = (key: string, msg: string): void => {
    if (logged[key]) return;
    logged[key] = true;
    api.log(msg);
};

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (x: unknown): x is Record<string, any> => x !== null && typeof x === "object";
const toList = <T>(x: T | T[]): T[] => (Array.isArray(x) ? x : [x]);
const plain = (re: RegExp): RegExp => (/[gy]/.test(re.flags) ? new RegExp(re.source, re.flags.replace(/[gy]/g, "")) : re);
const dc = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const cloneItem = (i: SlotLike): Item => ({ name: i.name, amount: i.amount == null ? null : i.amount, attributes: dc(i.attributes || {}) });

const deepEq = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    for (const k of ka) {
        if (!has(b, k) || !deepEq(a[k], b[k])) return false;
    }
    return true;
};

const same = (a: SlotLike, b: SlotLike): boolean =>
    a.name === b.name && (a.amount == null ? null : a.amount) === (b.amount == null ? null : b.amount) && deepEq(a.attributes || {}, b.attributes || {});

const segs = (path: string): string[] => {
    const parts = String(path).split(".");
    for (const p of parts) {
        if (p === "" || BAD_SEGS.indexOf(p) !== -1) throw new Error("invalid path '" + path + "'. Use dotted keys like attributes.customDisplayName with no empty parts.");
    }
    return parts;
};

const readSegs = (obj: unknown, parts: string[]): any => {
    let o: any = obj;
    for (const p of parts) {
        if (!isObj(o) || !has(o, p)) return undefined;
        o = o[p];
    }
    return o;
};

const testValue = (matcher: Matcher, value: any, item: Item): any[] | null => {
    if (Array.isArray(matcher)) {
        for (const m of matcher) {
            const r = testValue(m, value, item);
            if (r) return r;
        }
        return null;
    }
    if (typeof matcher === "function") return matcher(value, item) ? [] : null;
    if (matcher === null) return value == null ? [] : null;
    if (matcher === true) return value == null ? null : [];
    if (value == null) return null;
    if (matcher instanceof RegExp) return plain(matcher).exec(String(value));
    return value === matcher ? [] : null;
};

const compileMatch = (spec: MatchSpec, bad: (msg: string) => never): Compiled["test"] => {
    if (typeof spec === "function") {
        return (item, ctx) => {
            const r = spec(item, ctx);
            return r ? (r === true ? {} : r) : null;
        };
    }
    if (typeof spec === "string" || spec instanceof RegExp) {
        return (item) => {
            const r = testValue(spec, item.name, item);
            return r ? { name: r } : null;
        };
    }
    if (Array.isArray(spec)) {
        if (spec.length === 0) bad("has an empty match list. Give it at least one name, regex, object or function.");
        const subs = spec.map((s) => compileMatch(s, bad));
        return (item, ctx) => {
            for (const f of subs) {
                const r = f(item, ctx);
                if (r) return r;
            }
            return null;
        };
    }
    if (!isObj(spec)) return bad("has a match of type " + typeof spec + ". Use a name, regex, function, list, or an object of paths.");
    const keys = Object.keys(spec);
    if (keys.length === 0) bad("has an empty match object. Add a path such as name or attributes.customDisplayName.");
    const checks: [string, string[], Matcher][] = keys.map((k) => {
        if (has(OLD_MATCH, k)) bad("uses match key '" + k + "' which was removed. " + OLD_MATCH[k]);
        let parts: string[] = [];
        try {
            parts = segs(k);
        } catch (e) {
            bad("has a bad match key: " + errText(e));
        }
        if (ROOTS.indexOf(parts[0]) === -1) bad("has match key '" + k + "' which must start with name, amount or attributes, for example attributes.customDisplayName.");
        if (spec[k] === undefined) bad("has match key '" + k + "' set to undefined. Use null to require it absent, true to require it present, or a value, regex or function.");
        return [k, parts, spec[k]];
    });
    return (item) => {
        const info: MatchInfo = {};
        for (const c of checks) {
            const r = testValue(c[2], readSegs(item, c[1]), item);
            if (!r) return null;
            info[c[0]] = r;
        }
        return info;
    };
};

const nameHint = (spec: MatchSpec): string[] | null => {
    if (typeof spec === "string") return [spec];
    if (Array.isArray(spec)) return spec.every((s) => typeof s === "string") ? (spec as string[]) : null;
    if (isObj(spec) && !(spec instanceof RegExp) && typeof spec.name === "string") return [spec.name];
    return null;
};

const stampList = (item: SlotLike): string[] => {
    const c = isObj(item.attributes) ? item.attributes.customAttributes : null;
    return isObj(c) && Array.isArray(c.appliedRules) ? c.appliedRules : [];
};

const stamp = (item: Item, id: string): void => {
    if (!isObj(item.attributes.customAttributes)) item.attributes.customAttributes = {};
    const c = item.attributes.customAttributes as Record<string, any>;
    if (!Array.isArray(c.appliedRules)) c.appliedRules = [];
    c.appliedRules.push(id);
};

const fail = (rule: Compiled, slot: SlotLike, index: number, where: string, e: unknown): void => {
    logOnce(
        "err:" + rule.label + ":" + where,
        "[ItemRules] rule " + rule.label + " " + where + " threw on " + slot.name + " in slot " + index + ": " + errText(e) +
            ". Rules get (item, ctx): item is the raw { name, amount, attributes } and ctx.m holds match results. Enchants live at item.attributes.customAttributes.enchantments."
    );
};

const add = (rule: ItemRule): Compiled => {
    const label = isObj(rule) && rule.id !== undefined ? String(rule.id) : "#" + rules.length;
    const bad = (msg: string): never => {
        throw new Error("ItemRules: rule " + label + " " + msg);
    };

    if (!isObj(rule) || Array.isArray(rule)) throw new Error("ItemRules: rule " + label + " must be an object like { match: /Sword$/, do: (item, ctx) => {...} }, found " + (Array.isArray(rule) ? "a list" : typeof rule) + ". Use addAll for lists.");
    for (const k of Object.keys(rule)) {
        if (RULE_KEYS.indexOf(k) === -1) bad("has unknown key '" + k + "'. Valid keys: " + RULE_KEYS.join(", ") + ".");
    }
    if (rule.match === undefined) bad("needs a match, for example match: /^Diamond/ or match: (item, ctx) => boolean.");
    if (rule.do === undefined) bad("needs a do function, for example do: (item, ctx) => { item.name = \"New\"; }.");
    const actions = toList(rule.do);
    if (actions.length === 0 || !actions.every((f) => typeof f === "function")) bad("do must be a function (item, ctx) => {...} or a list of them, found " + (Array.isArray(rule.do) ? (rule.do.length === 0 ? "an empty list" : "a list with a non-function entry") : typeof rule.do) + ".");
    if (rule.once === true && rule.id === undefined) bad("uses once: true but has no id. Give the rule an id or set once to a string.");
    if (rule.once !== undefined && rule.once !== true && typeof rule.once !== "string") bad("once must be true or a string id, found " + typeof rule.once + ".");
    if (rule.id !== undefined && has(ids, String(rule.id))) bad("uses an id that is already taken. Ids must be unique because once stamps items with them.");

    const compiled: Compiled = {
        label,
        test: compileMatch(rule.match, bad),
        names: nameHint(rule.match),
        actions,
        chain: rule.chain === true,
        once: rule.once === true ? String(rule.id) : rule.once || undefined
    };
    if (rule.id !== undefined) ids[String(rule.id)] = true;
    rules.push(compiled);
    return compiled;
};

const apply = (slot: SlotLike, playerId: PlayerId, index: number): ApplyResult => {
    const matched: string[] = [];
    let item = slot as Item;

    for (const rule of rules) {
        if (rule.names && rule.names.indexOf(item.name) === -1) continue;
        if (rule.once && stampList(item).indexOf(rule.once) !== -1) continue;
        const ctx: Ctx = { playerId, slot: index, rule: rule.label, m: {} };
        let found: MatchInfo | null;
        try {
            found = rule.test(item, ctx);
        } catch (e) {
            fail(rule, slot, index, "match", e);
            continue;
        }
        if (!found) continue;
        ctx.m = found;
        const work = cloneItem(item);
        if (rule.once) stamp(work, rule.once);
        try {
            for (const fn of rule.actions) fn(work, ctx);
        } catch (e) {
            fail(rule, slot, index, "do", e);
            continue;
        }
        item = work;
        matched.push(rule.label);
        if (item.name === "Air" || !rule.chain) break;
    }

    if (matched.length === 0) return { changed: false, removed: false, matched };
    if (item.name === "Air") return { changed: true, removed: true, matched };
    const out: Item = { name: item.name, amount: item.amount == null ? null : item.amount, attributes: item.attributes || {} };
    return { changed: !same(slot, out), removed: false, name: out.name, amount: out.amount, attributes: out.attributes, matched };
};

const scan = (playerId: PlayerId, firstSlot?: number, lastSlot?: number): number => {
    const first = firstSlot === undefined ? cfg.firstSlot : firstSlot;
    const last = lastSlot === undefined ? cfg.lastSlot : lastSlot;
    let changedCount = 0;
    for (let idx = first; idx <= last; idx++) {
        const slot = api.getItemSlot(playerId, idx);
        if (!slot) continue;
        const r = apply(slot, playerId, idx);
        if (!r.changed) continue;
        if (r.removed) api.setItemSlot(playerId, idx, "Air", null, {}, cfg.tellClient);
        else api.setItemSlot(playerId, idx, r.name as SetSlotArgs[2], r.amount, r.attributes as SetSlotArgs[4], cfg.tellClient);
        changedCount++;
    }
    return changedCount;
};

const config = (opts: { firstSlot?: number; lastSlot?: number; tellClient?: boolean }): { firstSlot: number; lastSlot: number; tellClient: boolean } => {
    if (!isObj(opts) || Array.isArray(opts)) throw new Error("ItemRules: config expects an object like { firstSlot: 0, lastSlot: 50, tellClient: true }, found " + (Array.isArray(opts) ? "a list" : typeof opts) + ".");
    if ((opts as any).ignoreEnchants !== undefined) throw new Error("ItemRules: config ignoreEnchants was removed because rules now see the raw item. Test an enchant with a path key such as \"attributes.customAttributes.enchantments.Forged\": null (null means absent) inside match, and remove ignoreEnchants from your config call.");
    for (const k of Object.keys(opts)) {
        if (CONFIG_KEYS.indexOf(k) === -1) throw new Error("ItemRules: config has unknown key '" + k + "'. Valid keys: " + CONFIG_KEYS.join(", ") + ".");
    }
    for (const k of ["firstSlot", "lastSlot"] as const) {
        const v = opts[k];
        if (v === undefined) continue;
        if (typeof v !== "number") throw new Error("ItemRules: config " + k + " must be a number, found " + typeof v + ".");
        cfg[k] = v;
    }
    if (opts.tellClient !== undefined) cfg.tellClient = !!opts.tellClient;
    return Object.assign({}, cfg);
};

export let ItemRules = {
    config,
    add,
    addAll: (list: ItemRule[]): Compiled[] => list.map(add),
    clear: (): void => {
        rules.length = 0;
        for (const k of Object.keys(ids)) delete ids[k];
    },
    list: (): string[] => rules.map((r) => r.label),
    apply,
    scan,
    run: scan
};
