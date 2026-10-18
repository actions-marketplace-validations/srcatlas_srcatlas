import { Controller, Get } from "@nestjs/common";

// No module lists this controller.
@Controller("orphans")
export class OrphanController {
  @Get() list() {}
}
