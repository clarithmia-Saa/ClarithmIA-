// Minimal ambient declarations so the functions type-check without @types/node.
declare const process: { env: Record<string, string | undefined> };
