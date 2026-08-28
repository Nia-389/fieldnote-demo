# Fieldnote

Fieldnote is a local-first browser prototype for qualitative document coding and the creation of structured, AI-ready annotation datasets.

The public showcase includes only synthetic demonstration data.

## Public demo

Try Fieldnote here:

https://nia-389.github.io/fieldnote-demo/

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

The interface is designed to keep the active text segment visible while coding across multiple dimensions.

## Synthetic showcase data

The public version includes a small fictional climate-narratives project created only for demonstration.

It contains:

- 5 synthetic documents;
- 15 synthetic segments;
- several example coding dimensions;
- coded and uncoded segments;
- single-label and multi-label examples;
- review and confidence examples;
- explicit not-applicable decisions.

No real research corpus, annotations, or participant data are included in this repository.

## Local-first data storage

Fieldnote does not require a central Fieldnote server for ordinary use.

Projects created in the app are stored in the visitor’s browser. This means that project data are associated with the specific browser, device, and site origin being used.

Fieldnote does not automatically upload locally created project content to this GitHub repository.

For preservation or transfer between browsers or devices, users should export a Fieldnote project backup.

## Prototype status

Fieldnote is currently a research prototype under active development.

The public deployment is intended for demonstration, testing, and feedback rather than as a production service.

## Local development

To run the project locally:

```bash
npm install
npm run dev
