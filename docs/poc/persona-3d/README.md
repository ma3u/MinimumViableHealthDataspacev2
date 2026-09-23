# Persona graph prototypes

Four 3D "one view per role" prototypes of the knowledge graph, discussed in
[discussion #265](https://github.com/ma3u/MinimumViableHealthDataspacev2/discussions/265).

- Live: https://ehds.mabu.red/poc/persona-3d/
- Source: `ui/public/poc/persona-3d/` (`engine.js` shared, one page per persona)
- Data: the static fixtures under `ui/public/mock/`, pinned to 2026-09-23
- Screenshots in `img/` are referenced from the discussion

| Persona     | Page              | Question                                                     |
| ----------- | ----------------- | ------------------------------------------------------------ |
| Patient     | `patient.html`    | Which parameters put me at risk, what next, who uses my data |
| Researcher  | `researcher.html` | What may I use today, what is stuck, what am I missing       |
| Access body | `hdab.html`       | Which operations are non-compliant, which decisions overdue  |
| Data holder | `hospital.html`   | Which consumers are untrusted, which contracts missing       |
