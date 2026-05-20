/**
 * Digital Life category — self-registration barrel.
 */
import { registry } from "~/detectors/registry";
import { apiKeyDetector }      from "./api-key";
import { privateKeyDetector }  from "./private-key";
import { passwordDetector }    from "./password";
import { emailDetector }       from "./email";
import { phoneIntlDetector }   from "./phone-intl";
import { cloudKeyDetectors }   from "./cloud-keys";

registry.register(apiKeyDetector);
registry.register(privateKeyDetector);
registry.register(passwordDetector);
registry.register(emailDetector);
registry.register(phoneIntlDetector);
for (const d of cloudKeyDetectors) registry.register(d);

export {
  apiKeyDetector,
  privateKeyDetector,
  passwordDetector,
  emailDetector,
  phoneIntlDetector,
  cloudKeyDetectors,
};
