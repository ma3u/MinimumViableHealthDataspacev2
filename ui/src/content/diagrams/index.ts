/**
 * The Mermaid charts of the hand-written docs pages, by id (ADR-071).
 * localizedChart(id, lang) in @/lib/i18n/diagrams picks the language. A
 * translator adds a language to a chart's own module and never edits this
 * file; a new chart is one module and one line here.
 */
import qualityGatesPipeline from "./quality-gates-pipeline";
import userGuideCompliance from "./user-guide-compliance";
import userGuideWorkflow from "./user-guide-workflow";

export const DIAGRAMS = {
  "quality-gates-pipeline": qualityGatesPipeline,
  "user-guide-compliance": userGuideCompliance,
  "user-guide-workflow": userGuideWorkflow,
};

export type ChartId = keyof typeof DIAGRAMS;
