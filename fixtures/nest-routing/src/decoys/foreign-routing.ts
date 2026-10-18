import { Controller, Get } from "some-other-lib";

@Controller("foreign")
export class ForeignRoutingController {
  @Get() list() {}
}
