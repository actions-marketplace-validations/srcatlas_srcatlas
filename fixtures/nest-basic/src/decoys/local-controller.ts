// A Controller and a Get that are local functions, not the NestJS ones.
function Controller(_path: string) {
  return (target: unknown) => target;
}

function Get(_path?: string) {
  return (_target: object, _key: string) => {};
}

@Controller("decoys")
export class LocalController {
  @Get() list() {}
}
