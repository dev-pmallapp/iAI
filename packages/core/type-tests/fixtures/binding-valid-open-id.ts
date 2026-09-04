// Positive control for case 2 (P0, CLAIM-31.1), Decision 1 of
// docs/design/stories/31.md: the id union is OPEN, so `nullBinding`'s id and a
// hypothetical sixth domain both assign. Neither is one of the five at
// docs/design/01-skill-hierarchy.md:187, and CLAIM-31.3 requires both to be
// expressible without editing packages/core/src.
import type { DomainId, KnownDomainId } from "../../src/binding/domain";

const nullId: DomainId = "null";
const sixth: DomainId = "legal";
const known: DomainId = "trade";

// The narrow union still accepts each of the five, so widening for assignment
// did not lose the names CLAIM-31.6 expects to find in core.
const one: KnownDomainId = "dev";
const two: KnownDomainId = "trade";
const three: KnownDomainId = "health";
const four: KnownDomainId = "wealth";
const five: KnownDomainId = "know";

export { nullId, sixth, known, one, two, three, four, five };
