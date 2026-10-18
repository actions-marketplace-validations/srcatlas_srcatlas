import { type CycleKind, cyclesOf, type GraphFile } from "@srcatlas/core";

/** Head cycles that are not already inside one base cycle (section 13.1). */
export function newCycles(
  base: GraphFile,
  head: GraphFile,
): { kind: CycleKind; members: string[] }[] {
  return (["modules", "packages"] as const).flatMap((kind) => {
    const owner = new Map<string, number>();
    cyclesOf(base, kind).forEach((c, i) => {
      for (const m of c) owner.set(m, i);
    });
    return cyclesOf(head, kind)
      .filter((c) => {
        const first = owner.get(c[0] ?? "");
        return first === undefined || c.some((m) => owner.get(m) !== first);
      })
      .map((members) => ({ kind, members }));
  });
}
