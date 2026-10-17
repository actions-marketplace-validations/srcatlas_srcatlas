import { Module } from "@nestjs/common";

// Test files are excluded by default (docs/config.md 2.1): no node for this module.
@Module({})
export class OnlyInTestModule {}
