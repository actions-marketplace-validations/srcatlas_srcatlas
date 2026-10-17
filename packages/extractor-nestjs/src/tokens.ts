// docs/extractors/nestjs.md section 3. Pure: tokens, modules and providers are opaque ids, so
// this runs on whatever the module and provider patterns produce.

export interface ProviderRegistration {
  /** Opaque token key, see `tokenKeyOf`. */
  token: string;
  /** Id of the provider node that satisfies the token. */
  provider: string;
}

export interface ModuleRegistration {
  id: string;
  global: boolean;
  /** Ids of directly imported modules. */
  imports: string[];
  providers: ProviderRegistration[];
}

interface Entry {
  module: string;
  provider: string;
}

export interface TokenTable {
  modules: Map<string, ModuleRegistration>;
  byToken: Map<string, Entry[]>;
}

export type Step = "own" | "imported" | "global" | "anywhere";

export type Resolution =
  | {
      found: true;
      step: Step;
      /** Provider ids in code-unit order, without duplicates. */
      providers: string[];
      confidence: "certain" | "inferred";
      code?: "nest.ambiguous-token";
    }
  | {
      found: false;
      /** Absent for a third-party class: no edge and no report entry (step 5). */
      code?: "nest.unresolved-provider-token";
    };

/** Step 1: the token table from every `providers` array of the package. */
export function buildTokenTable(modules: ModuleRegistration[]): TokenTable {
  const table: TokenTable = { modules: new Map(), byToken: new Map() };
  const seen = new Set<string>();
  for (const m of modules) {
    table.modules.set(m.id, m);
    for (const p of m.providers) {
      // The same registration listed twice is one candidate.
      const key = JSON.stringify([p.token, m.id, p.provider]);
      if (seen.has(key)) continue;
      seen.add(key);
      const list = table.byToken.get(p.token) ?? [];
      list.push({ module: m.id, provider: p.provider });
      table.byToken.set(p.token, list);
    }
  }
  return table;
}

const byCodeUnit = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * Steps 3 to 5: own module, imported modules, global modules, anywhere; the first step with a
 * candidate wins. Several candidates at that step are all used, inferred, and reported.
 * `token` is `undefined` when the token expression could not be evaluated.
 */
export function resolveToken(
  table: TokenTable,
  query: {
    token: string | undefined;
    /** The injecting class's module. */
    module: string;
    /** Where the token's class or constant is declared (step 5). */
    origin: "repo" | "external";
  },
): Resolution {
  const entries =
    query.token === undefined ? [] : (table.byToken.get(query.token) ?? []);
  const imports = new Set(table.modules.get(query.module)?.imports ?? []);
  const steps: [Step, (e: Entry) => boolean][] = [
    ["own", (e) => e.module === query.module],
    ["imported", (e) => imports.has(e.module)],
    ["global", (e) => table.modules.get(e.module)?.global === true],
    ["anywhere", () => true],
  ];
  for (const [step, accepts] of steps) {
    const candidates = entries.filter(accepts);
    if (candidates.length === 0) continue;
    const ambiguous = candidates.length > 1;
    return {
      found: true,
      step,
      providers: [...new Set(candidates.map((c) => c.provider))].sort(
        byCodeUnit,
      ),
      confidence: step === "anywhere" || ambiguous ? "inferred" : "certain",
      ...(ambiguous ? { code: "nest.ambiguous-token" as const } : {}),
    };
  }
  return query.token !== undefined && query.origin === "external"
    ? { found: false }
    : { found: false, code: "nest.unresolved-provider-token" };
}
