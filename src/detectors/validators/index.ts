/**
 * Validator barrel — re-exports all pure checksum / format validators.
 *
 * Each module is a single pure function with no I/O.
 * Constitution §VII: Every detector ships with validation beyond regex.
 */

export { luhn }          from "./luhn";
export { ibanMod97 }     from "./iban";
export { afmChecksum }   from "./afm";
export { nifSpain }      from "./nif-spain";
export { nifPortugal }   from "./nif-portugal";
export { codiceFiscale } from "./codice-fiscale";
export { ssnBlacklist }  from "./ssn";
export { inseeChecksum } from "./insee";
export { deTin }         from "./de-tin";
export { ukNino }        from "./uk-nino";
export { auTfn }         from "./au-tfn";
export { auAbn }         from "./au-abn";
export { abaRouting }    from "./aba-routing";
export { caSin }         from "./ca-sin";
export { jpMyNumber }    from "./jp-my-number";
export { plPesel }       from "./pl-pesel";
export { noNin }         from "./no-nin";
export { seNin }         from "./se-nin";
export { fiHetu }        from "./fi-hetu";
export { trTckn }        from "./tr-tckn";
export { ilId }          from "./il-id";
export { brCpf }         from "./br-cpf";
export { brCnpj }        from "./br-cnpj";
export { arCuit }        from "./ar-cuit";
