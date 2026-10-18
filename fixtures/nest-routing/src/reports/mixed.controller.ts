import { Controller, Get as Fetch } from "@nestjs/common";

// A method decorator named Get that is not the NestJS one.
function Get(_path: string) {
  return (_target: object, _key: string) => {};
}

@Controller("mixed")
export class MixedController {
  @Fetch("aliased") viaAlias() {}
  @Get("fake") fake() {}
  plain() {}
}
