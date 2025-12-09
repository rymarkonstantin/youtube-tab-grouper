// Minimal Node ESM module shims to keep tooling quiet before installing @types/node.
declare module "node:path" {
  const anyPath: any;
  export = anyPath;
}

declare module "node:url" {
  const anyUrl: any;
  export = anyUrl;
}

declare module "node:fs/promises" {
  const anyFs: any;
  export = anyFs;
}
