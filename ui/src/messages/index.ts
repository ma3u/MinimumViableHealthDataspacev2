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
import enPublic from "./en/public.json";
import enCompliance from "./en/compliance.json";
import enAccess from "./en/access.json";
import deNav from "./de/nav.json";
import deCommon from "./de/common.json";
import deSignin from "./de/signin.json";
import deCatalog from "./de/catalog.json";
import deJurisdictions from "./de/jurisdictions.json";
import deHome from "./de/home.json";
import dePublic from "./de/public.json";
import deCompliance from "./de/compliance.json";
import deAccess from "./de/access.json";
import frNav from "./fr/nav.json";
import frCommon from "./fr/common.json";
import frSignin from "./fr/signin.json";
import frCatalog from "./fr/catalog.json";
import frJurisdictions from "./fr/jurisdictions.json";
import frHome from "./fr/home.json";
import frPublic from "./fr/public.json";
import frCompliance from "./fr/compliance.json";
import frAccess from "./fr/access.json";
import nlNav from "./nl/nav.json";
import nlCommon from "./nl/common.json";
import nlSignin from "./nl/signin.json";
import nlCatalog from "./nl/catalog.json";
import nlJurisdictions from "./nl/jurisdictions.json";
import nlHome from "./nl/home.json";
import nlPublic from "./nl/public.json";
import nlCompliance from "./nl/compliance.json";
import nlAccess from "./nl/access.json";
import esNav from "./es/nav.json";
import esCommon from "./es/common.json";
import esSignin from "./es/signin.json";
import esCatalog from "./es/catalog.json";
import esJurisdictions from "./es/jurisdictions.json";
import esHome from "./es/home.json";
import esPublic from "./es/public.json";
import esCompliance from "./es/compliance.json";
import esAccess from "./es/access.json";
import enPatient from "./en/patient.json";
import enResearch from "./en/research.json";
import enHolder from "./en/holder.json";
import enExplore from "./en/explore.json";
import enAdmin from "./en/admin.json";
import dePatient from "./de/patient.json";
import deResearch from "./de/research.json";
import deHolder from "./de/holder.json";
import deExplore from "./de/explore.json";
import deAdmin from "./de/admin.json";
import frPatient from "./fr/patient.json";
import frResearch from "./fr/research.json";
import frHolder from "./fr/holder.json";
import frExplore from "./fr/explore.json";
import frAdmin from "./fr/admin.json";
import nlPatient from "./nl/patient.json";
import nlResearch from "./nl/research.json";
import nlHolder from "./nl/holder.json";
import nlExplore from "./nl/explore.json";
import nlAdmin from "./nl/admin.json";
import esPatient from "./es/patient.json";
import esResearch from "./es/research.json";
import esHolder from "./es/holder.json";
import esExplore from "./es/explore.json";
import esAdmin from "./es/admin.json";
import enDocsGuide from "./en/docsGuide.json";
import enDocsDeveloper from "./en/docsDeveloper.json";
import enDocsArchitecture from "./en/docsArchitecture.json";
import enDocsCommon from "./en/docsCommon.json";
import deDocsGuide from "./de/docsGuide.json";
import deDocsDeveloper from "./de/docsDeveloper.json";
import deDocsArchitecture from "./de/docsArchitecture.json";
import deDocsCommon from "./de/docsCommon.json";
import frDocsGuide from "./fr/docsGuide.json";
import frDocsDeveloper from "./fr/docsDeveloper.json";
import frDocsArchitecture from "./fr/docsArchitecture.json";
import frDocsCommon from "./fr/docsCommon.json";
import nlDocsGuide from "./nl/docsGuide.json";
import nlDocsDeveloper from "./nl/docsDeveloper.json";
import nlDocsArchitecture from "./nl/docsArchitecture.json";
import nlDocsCommon from "./nl/docsCommon.json";
import esDocsGuide from "./es/docsGuide.json";
import esDocsDeveloper from "./es/docsDeveloper.json";
import esDocsArchitecture from "./es/docsArchitecture.json";
import esDocsCommon from "./es/docsCommon.json";

export type Area =
  | "nav"
  | "common"
  | "signin"
  | "catalog"
  | "jurisdictions"
  | "home"
  | "public"
  | "compliance"
  | "access"
  | "patient"
  | "research"
  | "holder"
  | "explore"
  | "admin"
  | "docsGuide"
  | "docsDeveloper"
  | "docsArchitecture"
  | "docsCommon";

type Dictionary = Record<Area, Record<string, string>>;

export const MESSAGES: Record<CatalogLanguage, Dictionary> = {
  en: {
    nav: enNav,
    common: enCommon,
    signin: enSignin,
    catalog: enCatalog,
    jurisdictions: enJurisdictions,
    home: enHome,
    public: enPublic,
    compliance: enCompliance,
    access: enAccess,
    patient: enPatient,
    research: enResearch,
    holder: enHolder,
    explore: enExplore,
    admin: enAdmin,
    docsGuide: enDocsGuide,
    docsDeveloper: enDocsDeveloper,
    docsArchitecture: enDocsArchitecture,
    docsCommon: enDocsCommon,
  },
  de: {
    nav: deNav,
    common: deCommon,
    signin: deSignin,
    catalog: deCatalog,
    jurisdictions: deJurisdictions,
    home: deHome,
    public: dePublic,
    compliance: deCompliance,
    access: deAccess,
    patient: dePatient,
    research: deResearch,
    holder: deHolder,
    explore: deExplore,
    admin: deAdmin,
    docsGuide: deDocsGuide,
    docsDeveloper: deDocsDeveloper,
    docsArchitecture: deDocsArchitecture,
    docsCommon: deDocsCommon,
  },
  fr: {
    nav: frNav,
    common: frCommon,
    signin: frSignin,
    catalog: frCatalog,
    jurisdictions: frJurisdictions,
    home: frHome,
    public: frPublic,
    compliance: frCompliance,
    access: frAccess,
    patient: frPatient,
    research: frResearch,
    holder: frHolder,
    explore: frExplore,
    admin: frAdmin,
    docsGuide: frDocsGuide,
    docsDeveloper: frDocsDeveloper,
    docsArchitecture: frDocsArchitecture,
    docsCommon: frDocsCommon,
  },
  nl: {
    nav: nlNav,
    common: nlCommon,
    signin: nlSignin,
    catalog: nlCatalog,
    jurisdictions: nlJurisdictions,
    home: nlHome,
    public: nlPublic,
    compliance: nlCompliance,
    access: nlAccess,
    patient: nlPatient,
    research: nlResearch,
    holder: nlHolder,
    explore: nlExplore,
    admin: nlAdmin,
    docsGuide: nlDocsGuide,
    docsDeveloper: nlDocsDeveloper,
    docsArchitecture: nlDocsArchitecture,
    docsCommon: nlDocsCommon,
  },
  es: {
    nav: esNav,
    common: esCommon,
    signin: esSignin,
    catalog: esCatalog,
    jurisdictions: esJurisdictions,
    home: esHome,
    public: esPublic,
    compliance: esCompliance,
    access: esAccess,
    patient: esPatient,
    research: esResearch,
    holder: esHolder,
    explore: esExplore,
    admin: esAdmin,
    docsGuide: esDocsGuide,
    docsDeveloper: esDocsDeveloper,
    docsArchitecture: esDocsArchitecture,
    docsCommon: esDocsCommon,
  },
};
