import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { FleetController } from "./fleet.controller";

@Module({ controllers: [FleetController, AssetsController] })
export class FleetModule {}
