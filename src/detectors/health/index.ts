/**
 * Health category — self-registration barrel. Default OFF per FR-R1.
 */
import { registry } from "~/detectors/registry";
import { healthIdDetector }      from "./health-id";
import { medicalRecordDetector } from "./medical-record";
import { diagnosisDetector }     from "./diagnosis";

registry.register(healthIdDetector);
registry.register(medicalRecordDetector);
registry.register(diagnosisDetector);

export { healthIdDetector, medicalRecordDetector, diagnosisDetector };
