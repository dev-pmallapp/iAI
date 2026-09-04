// Case 2 (P0, CLAIM-31.1): opening `DomainId` must not open `KnownDomainId`.
// Decision 1 widens for assignment only; the narrow union stays closed at the
// five of docs/design/01-skill-hierarchy.md:187, which is what CLAIM-31.6's
// allowance for "the id union type" is checked against and what keeps an
// editor completing exactly those five.
import type { KnownDomainId } from "../../src/binding/domain";

// @ts-expect-error
const typo: KnownDomainId = "helth";

export { typo };
