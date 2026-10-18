---
"srcatlas": minor
---

The Prisma extractor finds client calls (`prisma.order.findMany()`, transactions, singletons, generator output paths) and the analyzer links them to `reads` and `writes` edges from the calling class to the model, with the operation names in `meta.operations`.
