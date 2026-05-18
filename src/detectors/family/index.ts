/**
 * Family category — self-registration barrel. Default OFF per FR-R1.
 */
import { registry } from "~/detectors/registry";
import { minorNameDetector }    from "./minor-name";
import { schoolInfoDetector }   from "./school-info";
import { familyAddressDetector } from "./family-address";

registry.register(minorNameDetector);
registry.register(schoolInfoDetector);
registry.register(familyAddressDetector);

export { minorNameDetector, schoolInfoDetector, familyAddressDetector };
