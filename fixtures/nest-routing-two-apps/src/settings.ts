// Not an application: setGlobalPrefix on any other object is ignored.
export const settings = { setGlobalPrefix: (_prefix: string) => {} };
settings.setGlobalPrefix("settings");
