/**
 * Money category — self-registration barrel.
 *
 * Importing this module registers all GA-tier money detectors
 * into the singleton registry. Import once at extension startup.
 */
import { registry } from "~/detectors/registry";
import { creditCardDetector }      from "./credit-card";
import { ibanDetector }            from "./iban";
import { usBankDetector }          from "./us-bank";
import { cryptoWalletDetector }    from "./crypto-wallet";
import { swiftDetector }           from "./swift";
import { ukBankDetector }          from "./uk-bank";
import { auBankDetector }          from "./au-bank";
import { caBankDetector }          from "./ca-bank";
import { jpBankDetector }          from "./jp-bank";
import { financeKeywordsDetector } from "./finance-keywords";
import { taxBetaDetectors }        from "./tax-beta";
import { ilBankDetector, nzBankDetector } from "./bank-beta";

registry.register(creditCardDetector);
registry.register(ibanDetector);
registry.register(usBankDetector);
registry.register(cryptoWalletDetector);
registry.register(swiftDetector);
registry.register(ukBankDetector);
registry.register(auBankDetector);
registry.register(caBankDetector);
registry.register(jpBankDetector);
registry.register(financeKeywordsDetector);
for (const d of taxBetaDetectors) registry.register(d);
registry.register(ilBankDetector);
registry.register(nzBankDetector);

export {
  creditCardDetector,
  ibanDetector,
  usBankDetector,
  cryptoWalletDetector,
  swiftDetector,
  ukBankDetector,
  auBankDetector,
  caBankDetector,
  jpBankDetector,
  financeKeywordsDetector,
  taxBetaDetectors,
  ilBankDetector,
  nzBankDetector,
};
