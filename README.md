# Fieldnote

Fieldnote is a local-first browser prototype for qualitative document coding and the creation of structured, AI-ready annotation datasets.

The project originated as a research-software tool designed to support systematic human annotation while making coded data easier to reuse for analysis, gold-standard dataset construction, and evaluation of AI models.

## Public demo

Try the Fieldnote showcase here:

https://nia-389.github.io/fieldnote-demo/

The public version contains only synthetic demonstration data.

No real research corpus, annotations, participant data, or other research datasets are included in this repository.

## What Fieldnote does

Fieldnote supports structured qualitative annotation through:

- documents and text segments;
- project-specific metadata;
- coding dimensions and codes;
- single- and multi-label annotation;
- explicit “No applicable code” decisions;
- segment-level memos;
- confidence and review status;
- project review and analysis;
- conventional research exports;
- AI-ready gold-standard exports for model training and evaluation.

The coding interface is designed to keep the active text segment visible while the researcher works across multiple coding dimensions.

## Synthetic showcase data

The public demo includes a small fictional climate-narratives project created specifically for demonstration.

It contains:

- 5 synthetic documents;
- 15 synthetic segments;
- several example coding dimensions;
- coded and uncoded segments;
- single-label and multi-label examples;
- review and confidence examples;
- explicit not-applicable decisions.

The synthetic material is not derived from the project's research corpus.

## Local-first data storage

Fieldnote does not require a central Fieldnote server for ordinary use.

Projects created in the application are stored in the visitor's browser. This means that project data are associated with the specific browser, device, and site origin being used.

Fieldnote does not automatically upload locally created project content to this GitHub repository.

For preservation or transfer between browsers or devices, users should export a Fieldnote project backup.

## Research and development

Fieldnote was initiated and developed by Estefanía Tamayo Pineda as a research-software project.

The project is being developed in the context of the **ClimateHopeAI** research group. Additional human contributors will be acknowledged here as they make substantive contributions to the software, research design, documentation, testing, or associated methodology.

### Contributors

- **Estefanía Tamayo Pineda** — project conception, research requirements, annotation workflow, interface and feature design, software development direction, testing and validation.

Additional contributors will be added as the project develops.

## AI-assisted development

Fieldnote has been developed with AI-assisted software development tools, including **OpenAI Codex**.

Codex has been used to support tasks including code generation, refactoring, debugging, testing, documentation, and deployment configuration.

The project concept, research requirements, annotation framework, workflow design, interface decisions, validation criteria, and final integration decisions are human-directed. AI-assisted changes are reviewed and tested before incorporation into the project.

OpenAI Codex is acknowledged as a development tool and is not treated as an author or copyright holder.

Responsibility for the software, its design, and its research use remains with the human project authors and maintainers.

## Citation and attribution

Fieldnote is a research-software output.

If you use, adapt, or build upon Fieldnote in research, teaching, software development, or scholarly publications, please acknowledge the original project and creator.

For the current prototype, please cite or acknowledge:

> Tamayo Pineda, Estefanía. *Fieldnote*. Research software prototype, 2026.  
> https://github.com/Nia-389/fieldnote-demo

A formal software citation and DOI may be added to a future stable release.

## Licence

Fieldnote is released under the **MIT License**.

Copyright © 2026 Estefanía Tamayo Pineda.

See the [`LICENSE`](LICENSE) file for details.

The MIT License permits reuse, modification, and redistribution, provided that the copyright and licence notice are retained.

## Prototype status

Fieldnote is currently a research prototype under active development.

The public deployment is intended for demonstration, testing, research development, and feedback rather than as a production service.

## Local development

To run the project locally:

```bash
npm install
npm run dev
