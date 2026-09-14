# Diagrams

| File                                   | What it is                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ehds-secondary-journey-bilingual.png` | The EHDS secondary-use journey as an audience-facing infographic, English and Spanish. Used in the Spanish HDAB demo (issue #27). |
| `fix-hdab-badge.py`                    | How the caption on that image was corrected. Kept for provenance, and because the same class of error tends to recur.             |
| `graph-5layer.mmd`                     | The 5-layer knowledge graph, Mermaid.                                                                                             |
| `federation-sequence.mmd`              | Federated query sequence, Mermaid.                                                                                                |
| `jad-deployment.puml`                  | JAD stack deployment, PlantUML.                                                                                                   |

The technical counterpart of the infographic is [`docs/userjourney.drawio`](../userjourney.drawio),
the same journey as swimlanes, and it is the one the demo script walks step by
step.

## About the caption fix

The image was generated, and the generator produced "Health **O**ata Access
Body" and "**Firgonbmío de Accces** a Datos de Salud" on the HDAB badge. Two
words of that are not Spanish and one is not English, on a slide shown to a
Spanish regulator.

`fix-hdab-badge.py` repaints the three caption lines. The interesting part is
finding where the navy circle ends on each row, because both obvious methods
are wrong and both fail quietly:

- Scanning inward from the margin stops on the page frame, which is the same
  navy, and fills the white between frame and circle.
- Walking outward from the centre stops inside the caption, because a run of
  light glyph pixels looks exactly like having left the circle. Half of each
  line of old text survives and the new text is drawn on top of it.

So the circle is measured rather than probed: its edges are read on rows above
and below the caption, where nothing overlaps them, a circle is fitted to
those, and the fit is asserted against rows it was not built from before
anything is painted. That assertion is what caught the first attempt, where
`y=1340` turned out to be inside the big "HDAB" lettering.

The generator watermark is left in place on purpose. It marks the image as
machine-generated, and removing that would misrepresent where it came from.
