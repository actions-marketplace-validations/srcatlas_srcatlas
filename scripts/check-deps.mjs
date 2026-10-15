// Enforces CLAUDE.md non-negotiable 5 on declared workspace dependencies.
// pnpm's strict node_modules means an undeclared import cannot resolve, so
// checking package.json is enough.
import { readdirSync, readFileSync } from "node:fs";

const FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const pkgs = readdirSync("packages").map((dir) =>
  JSON.parse(readFileSync(`packages/${dir}/package.json`, "utf8")),
);

const errors = [];
for (const pkg of pkgs) {
  for (const field of FIELDS) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (!dep.startsWith("@srcatlas/")) continue;
      const name = dep.slice("@srcatlas/".length);
      if (pkg.name === "@srcatlas/core") errors.push(`core must not depend on ${dep}`);
      else if (pkg.name.startsWith("@srcatlas/extractor-") && name !== "core")
        errors.push(`${pkg.name} may only depend on @srcatlas/core, found ${dep}`);
      else if (name === "analyzer" && pkg.name !== "srcatlas")
        errors.push(`${pkg.name} must not depend on @srcatlas/analyzer`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`dependency direction ok (${pkgs.length} packages)`);
