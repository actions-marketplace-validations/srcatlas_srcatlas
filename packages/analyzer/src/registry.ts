import type { Extractor } from "@srcatlas/core";
import { nestjsExtractor } from "@srcatlas/extractor-nestjs";
import { prismaExtractor } from "@srcatlas/extractor-prisma";
import type { Project } from "ts-morph";

/** Extractors the analyser can run. Each extractor package adds itself here when its first pattern lands. */
export const builtinExtractors: Extractor<Project>[] = [
  nestjsExtractor,
  prismaExtractor,
];
