/**
 * Location category — self-registration barrel. Default OFF per FR-R1.
 */
import { registry } from "~/detectors/registry";
import { homeAddressDetector } from "./home-address";
import { gpsCoordsDetector }   from "./gps-coords";
import { itineraryDetector }   from "./itinerary";

registry.register(homeAddressDetector);
registry.register(gpsCoordsDetector);
registry.register(itineraryDetector);

export { homeAddressDetector, gpsCoordsDetector, itineraryDetector };
