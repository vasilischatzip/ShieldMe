/**
 * Digital Life category — self-registration barrel.
 */
import { registry } from "~/detectors/registry";
import { apiKeyDetector }      from "./api-key";
import { privateKeyDetector }  from "./private-key";
import { passwordDetector }    from "./password";
import { emailDetector }       from "./email";
import { phoneIntlDetector }   from "./phone-intl";

registry.register(apiKeyDetector);
registry.register(privateKeyDetector);
registry.register(passwordDetector);
registry.register(emailDetector);
registry.register(phoneIntlDetector);

export { apiKeyDetector, privateKeyDetector, passwordDetector, emailDetector, phoneIntlDetector };
