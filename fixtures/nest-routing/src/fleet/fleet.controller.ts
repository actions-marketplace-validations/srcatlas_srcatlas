import { Controller, Get } from "@nestjs/common";

@Controller(["fleet", "vehicles"])
export class FleetController {
  @Get(["all", "active"]) many() {}
  @Get(":id") one() {}
}
