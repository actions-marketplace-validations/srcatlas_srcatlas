// Runs after tsc: writes the JSON Schema next to the compiled output.
import { writeFileSync } from "node:fs";
import { graphJsonSchema } from "../dist/index.js";

writeFileSync(
  new URL("../dist/graph.schema.json", import.meta.url),
  `${JSON.stringify(graphJsonSchema(), null, 2)}\n`,
);
