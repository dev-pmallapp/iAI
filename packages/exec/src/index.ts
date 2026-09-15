// Named re-exports only, never `export *`, matching packages/core's barrels.
// `export *` at a barrel makes every new module a potential name collision --
// the TS2308 that the Rung union caused in S1.5.
export { ALLOWED_EXECUTABLES, checkArgv } from "./port";
export type { ArgvCheck, ExecResult, Port, PortRefusal } from "./port";

export { createRealPort, DEFAULT_MAX_BUFFER_BYTES, DEFAULT_TIMEOUT_MS, REFUSED_EXIT_CODE } from "./real";
export type { RealPortOptions } from "./real";

export { createRecordingPort } from "./recording";
export type { RecordedCall, RecordingPort } from "./recording";
