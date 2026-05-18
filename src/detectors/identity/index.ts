/**
 * Identity category — self-registration barrel.
 */
import { registry } from "~/detectors/registry";
import { ssnDetector }            from "./ssn";
import { passportDetector }        from "./passport";
import { driversLicenseDetector }  from "./drivers-license";
import { nationalIdDetector }      from "./national-id";
import { dobDetector }             from "./dob";
import { nameAddressDetector }     from "./name-address";
import { natIdBetaDetectors }      from "./national-id-beta";

registry.register(ssnDetector);
registry.register(passportDetector);
registry.register(driversLicenseDetector);
registry.register(nationalIdDetector);
registry.register(dobDetector);
registry.register(nameAddressDetector);
for (const d of natIdBetaDetectors) registry.register(d);

export {
  ssnDetector,
  passportDetector,
  driversLicenseDetector,
  nationalIdDetector,
  dobDetector,
  nameAddressDetector,
  natIdBetaDetectors,
};
