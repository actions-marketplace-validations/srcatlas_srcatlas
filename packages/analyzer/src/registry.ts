import type { Extractor } from "@srcatlas/core";
import type { Project } from "ts-morph";

/** Extractors the analyser can run. Each extractor package adds itself here when its first pattern lands. */
export const builtinExtractors: Extractor<Project>[] = [];
