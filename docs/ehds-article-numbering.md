# EHDS article numbering: proposal vs adopted

Most EHDS article references in this repository are the numbers from the 2022
proposal, COM(2022) 197 final. The Regulation was renumbered before adoption, and
the adopted numbers in Regulation (EU) 2025/327 are different, in places by more
than twenty.

This matters in one specific room. A regulator who knows the Regulation reads
"secure processing environment, Art. 50" and sees Art. 50 of the adopted text,
which is _Applicability to health data holders_. The claim looks wrong even
though the substance is right.

**New material uses the adopted numbers.** Existing material has not been
rewritten: roughly 48 files carry proposal numbers, and a mass renumber before a
demo is the kind of change that quietly breaks something. Use this table when
reading them, and correct a file whenever you are editing it anyway.

## Chapter IV, secondary use

| Proposal | Title in the proposal                       | Adopted | Title as adopted                                   |
| -------: | ------------------------------------------- | ------: | -------------------------------------------------- |
|       33 | Minimum categories of electronic data       |  **51** | Minimum categories of electronic health data       |
|       34 | Purposes for secondary use                  |  **53** | Purposes for which data can be processed           |
|       35 | Prohibited secondary use                    |  **54** | Prohibited secondary use                           |
|       36 | Health data access bodies                   |  **55** | Health data access bodies                          |
|       37 | Tasks of health data access bodies          |  **57** | Tasks of health data access bodies                 |
|       38 | Obligations towards natural persons         |  **58** | Obligations towards natural persons                |
|       39 | Reporting by health data access bodies      |  **59** | Reporting by health data access bodies             |
|       41 | Duties of data holders                      |  **60** | Duties of health data holders                      |
|       42 | Fees                                        |  **62** | Fees                                               |
|       43 | Penalties by health data access bodies      |  **63** | Enforcement by health data access bodies           |
|       44 | Data minimisation and purpose limitation    |  **66** | Data minimisation and purpose limitation           |
|       45 | Data access applications                    |  **67** | Health data access applications                    |
|       46 | Data permit                                 |  **68** | Data permit                                        |
|       47 | Data request                                |  **69** | Health data request                                |
|       49 | Access from a single data holder            |  **72** | Simplified procedure, trusted health data holder   |
|       50 | Secure processing environment               |  **73** | Secure processing environment                      |
|       51 | Joint controllers                           |  **74** | Controllership                                     |
|       52 | Cross-border infrastructure (HealthData@EU) |  **75** | HealthData@EU                                      |
|       53 | Access to cross-border sources              |  **76** | Access to cross-border registries or databases     |
|       55 | Dataset description                         |  **77** | Dataset description and dataset catalogue          |
|       56 | Data quality and utility label              |  **78** | Data quality and utility label                     |
|       57 | EU Datasets Catalogue                       |  **79** | EU dataset catalogue                               |
|       58 | Minimum dataset specifications              |  **80** | Minimum specifications for datasets of high impact |

No successor: proposal Art. 40 (data altruism in health) and Art. 54 (mutual
recognition) were absorbed elsewhere. New in the adopted text with no proposal
counterpart: Art. 56 (Union health data access service), Art. 61 (duties of
health data users), Art. 70 (templates), Art. 71 (opt-out from secondary use),
Art. 81 (right to complain).

## Elsewhere

| Proposal | Subject                                | Adopted                                 |
| -------: | -------------------------------------- | --------------------------------------- |
|        3 | Rights of natural persons, primary use | **3 to 10** (split into seven articles) |
|        5 | Priority categories, primary use       | **14**                                  |
|        6 | European EHR exchange format           | **15**                                  |
|        9 | Identification management              | **16**                                  |
|       10 | Digital health authority               | **19**                                  |
|       12 | MyHealth@EU                            | **23**                                  |
|       29 | Risks and serious incidents            | **44**                                  |
|       59 | Capacity building                      | **82**                                  |
|       64 | EHDS Board                             | **92**                                  |
|       65 | Tasks of the EHDS Board                | **94**                                  |
|       66 | Joint controllership groups            | **95** (now steering groups)            |
|       72 | Entry into force and application       | **105**                                 |

There is no constant offset. Art. 36 shifts by 19, Art. 37 by 20, Art. 46 by 22,
Art. 50 by 23. Look it up rather than adding a number.

## Dates, from Art. 105

| Date          | What applies                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| 26 March 2027 | The Regulation generally. Access bodies and national contact points designated and notified (Art. 55(6), 75(1)).      |
| 26 March 2029 | Chapter IV in full. Chapter II for the first priority categories of data.                                             |
| 26 March 2031 | The further data categories in Art. 51(1)(b), (f), (g), (m), (p), and Chapter III for EHR systems already in service. |
| 26 March 2035 | Third-country participation in HealthData@EU, Art. 75(5).                                                             |

## One claim worth re-checking

`docs/audit-retention-policy.md` cites "EHDS Art. 50(3)" for a ten-year retention
duty on access events. The adopted Art. 73(1)(e) requires access logs to be kept
"for the period necessary to verify and audit all processing operations", and at
least one year. Whatever the ten years rests on, it is not that paragraph, so the
source needs establishing before the number is quoted to anyone.
