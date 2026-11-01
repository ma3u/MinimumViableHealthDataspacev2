/**
 * The interface's dictionaries (#782, phase 2): one per language and area,
 * English text to its translation. English is the source; en/ maps each text
 * to itself so the parity test knows every key. Add an area here and in each
 * language folder; __tests__/unit/lib/i18n-messages.test.ts checks them.
 */
import type { CatalogLanguage } from "@/lib/metadata-language";
import enNav from "./en/nav.json";
import enCommon from "./en/common.json";
import enSignin from "./en/signin.json";
import enCatalog from "./en/catalog.json";
import enJurisdictions from "./en/jurisdictions.json";
import enHome from "./en/home.json";
import deNav from "./de/nav.json";
import deCommon from "./de/common.json";
import deSignin from "./de/signin.json";
import deCatalog from "./de/catalog.json";
import deJurisdictions from "./de/jurisdictions.json";
import deHome from "./de/home.json";
import frNav from "./fr/nav.json";
import frCommon from "./fr/common.json";
import frSignin from "./fr/signin.json";
import frCatalog from "./fr/catalog.json";
import frJurisdictions from "./fr/jurisdictions.json";
import frHome from "./fr/home.json";
import nlNav from "./nl/nav.json";
import nlCommon from "./nl/common.json";
import nlSignin from "./nl/signin.json";
import nlCatalog from "./nl/catalog.json";
import nlJurisdictions from "./nl/jurisdictions.json";
import nlHome from "./nl/home.json";
import esNav from "./es/nav.json";
import esCommon from "./es/common.json";
import esSignin from "./es/signin.json";
import esCatalog from "./es/catalog.json";
import esJurisdictions from "./es/jurisdictions.json";
import esHome from "./es/home.json";

export type Area =
  | "nav"
  | "common"
  | "signin"
  | "catalog"
  | "jurisdictions"
  | "home";
type Dictionary = Record<Area, Record<string, string>>;

export const MESSAGES: Record<CatalogLanguage, Dictionary> = {
  en: {
    nav: enNav,
    common: enCommon,
    signin: enSignin,
    catalog: enCatalog,
    jurisdictions: enJurisdictions,
    home: enHome,
  },
  de: {
    nav: deNav,
    common: deCommon,
    signin: deSignin,
    catalog: deCatalog,
    jurisdictions: deJurisdictions,
    home: deHome,
  },
  fr: {
    nav: frNav,
    common: frCommon,
    signin: frSignin,
    catalog: frCatalog,
    jurisdictions: frJurisdictions,
    home: frHome,
  },
  nl: {
    nav: nlNav,
    common: nlCommon,
    signin: nlSignin,
    catalog: nlCatalog,
    jurisdictions: nlJurisdictions,
    home: nlHome,
  },
  es: {
    nav: esNav,
    common: esCommon,
    signin: esSignin,
    catalog: esCatalog,
    jurisdictions: esJurisdictions,
    home: esHome,
  },
};
