// Named re-exports only, never `export *`, matching guards/index.ts,
// classify/index.ts, gh/index.ts and evidence/index.ts. Values and types are
// listed separately so a consumer can see at a glance which names carry runtime
// weight.
//
// Grouped one module at a time in the order the modules land. #32 ships the
// contract and the result shape; #33 adds the validator and the registry; #34
// registers a binding from outside this package.
export { bindingFail, bindingOk } from "./types";
export type { BindingResult } from "./types";

export { KNOWN_DOMAIN_IDS } from "./domain";
export type {
  DomainBinding,
  DomainId,
  EvidenceSpec,
  GateSpec,
  KnownDomainId,
  LabelDef,
  Rung,
  RungVerifier,
  UnitSpec,
  VerifySpec,
} from "./domain";

// The validator and the registry (#33). CLAIM-31.4 and CLAIM-31.5 are enforced
// at registration per Decision 11, so resolution is a lookup.
export { domainLabelFor, validateBinding } from "./validate";
export { createRegistry, registeredDomainIds, resolveBinding } from "./registry";
export type { Registry, ResolveResult } from "./registry";
