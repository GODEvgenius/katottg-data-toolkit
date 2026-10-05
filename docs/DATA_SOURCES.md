# Input datasets and source tracking

This repository distributes software, documentation and fictional test fixtures. It contains no codifier, territorial-status dataset, source Word/Excel documents or geographic records. Obtain the intended source editions independently and keep generated files in the ignored `data_files/` directory.

## Administrative codifier: KATOTTG

Source: [official KATOTTG publication page](https://mininfra.gov.ua/diialnist/rozvytok-mistsevoho-samovriaduvannia/kodyfikator-administratyvno-terytorialnykh-odynyts-ta-terytorialnykh-hromad).

The codifier supplies codes, names, categories and parent relationships across four administrative levels. The importer recognizes a full code of `UA` followed by 17 digits. Five-digit display identifiers are retained for inspection, while order joins use full codes.

Supported Word/Excel tables identify the first through fourth levels, category and name. The converter detects columns from headings and contents. Record the publication URL, downloaded filename and source edition when rebuilding data.

## Territorial-status documents

Source: [official text of Order No. 376 and its editions](https://zakon.rada.gov.ua/laws/show/z0380-25).

Input tables describe territories subject to possible hostilities, active hostilities or temporary occupation. They can include full administrative codes, status start/end dates and information-system availability.

The converter reads multiple `.docx`, `.xlsx` and `.xls` files, preserves separate periods, combines duplicate source references and records filename/table/row locations. It does not retrieve amendments automatically. Select the source edition you intend to analyse and record its date; an import or package date does not prove that a source is current.

## Administrative boundaries

Referenced source: [HDX Ukraine COD-AB](https://data.humdata.org/dataset/cod-ab-ukr).

Administrative GeoJSON supplies boundaries and geographic identifiers for the prepared records. The geographic module enriches compatible features and generates layers and settlement chunks for the viewer. Provider downloads may require format conversion or identifier mapping before use.

The interface also links to:

- [geoBoundaries country downloads](https://www.geoboundaries.org/countryDownloads.html).
- [Geofabrik Ukraine / OpenStreetMap extracts](https://download.geofabrik.de/europe/ukraine.html).

These are source options, not datasets bundled with the software. Review the chosen download's coverage, version, reference date, licence and attribution. Do not infer that every uploaded file came from HDX simply because that provider is linked in the interface.

## Prepared outputs

`data.json` is the prepared record array, not an additional upstream source. The merged Excel workbook is another export of the preparation result. GeoJSON contains matched geographic features; `manifest.json` describes the package.

Geometry counts can differ from administrative-record counts. Review match coverage, missing identifiers and administrative levels after each geographic import. The viewer derives parent summaries from JSON rather than relying on older status fields embedded in geometry.

Some legacy city-district records repeat their special-status city's code. The summary lookup prefers the upper-level record and counts level-4 entries separately without inventing identifiers. Parent summaries are calculations and do not create documentary status histories.

## Dates and provenance to retain

Keep these dates separate:

1. Source-document edition / amendment date.
2. Start and end dates for an individual territory's status.
3. Geographic version and reference date.
4. Package `updated_at`, which records when the prepared package was generated.

For each input, retain its source URL, download date, filename, edition/version and applicable attribution. The import report records file/table/row references; URLs and licensing details still need to be supplied by the person preparing the data.
