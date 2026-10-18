import { Injectable } from "@nestjs/common";
// The output path of the archive generator: the file is generated and not in the repository.
import { PrismaClient } from "./generated/archive/client";

@Injectable()
export class ArchiveDb extends PrismaClient {}
