# LinkedIn draft — English

From Word and Excel tables to structured data you can inspect and reuse.

I've published **KATOTTG Data Toolkit**, a browser-based tool for preparing and exploring Ukraine's administrative and territorial-status data.

The main focus is the preparation workflow:

• Import several Word or Excel files in one run.
• Detect tables and columns, handle merged cells and normalize records.
• Join records by full KATOTTG code, merge duplicates and retain source references and status histories.
• Export JSON or a merged Excel workbook, then enrich compatible GeoJSON with the prepared records.

The inputs have distinct roles: Ukraine's official administrative codifier (KATOTTG) provides identifiers and hierarchy; territorial-status documents under Order No. 376 provide occupation/hostilities categories, dates and information-system availability; administrative boundaries provide the geographic layer. HDX Ukraine COD-AB is linked as a boundary source option.

For regions, districts and communities, summaries use settlement-level records and show exact affected/total counts. The hierarchy, object cards and map use the same summary, while source status history remains separate.

The working service, **“ATU objects with occupation-status data,”** lets users search for names or identifiers, browse subordinate objects, filter by status and switch between table, hierarchy and map views.

Try the service: https://ontonew.snman.science/katottg/index.html
Repository: https://github.com/ye-shapovalov/katottg-data-toolkit

The public repository contains software and source documentation only. Users provide their own datasets and record the source editions and geographic attribution.

I'd welcome feedback from people working with administrative data, GIS and document-based data preparation.

#OpenData #DataPreparation #DataEngineering #GIS #Ukraine

---

## Publication notes

- Repository: https://github.com/ye-shapovalov/katottg-data-toolkit
- Attach `docs/assets/linkedin-data-pipeline.png`.
- Source references: [official KATOTTG codifier](https://mininfra.gov.ua/diialnist/rozvytok-mistsevoho-samovriaduvannia/kodyfikator-administratyvno-terytorialnykh-odynyts-ta-terytorialnykh-hromad), [territorial-status list under Order No. 376](https://zakon.rada.gov.ua/laws/show/z0380-25), and [HDX Ukraine COD-AB boundary source option](https://data.humdata.org/dataset/cod-ab-ukr).
- Suggested image alt text: “KATOTTG Data Toolkit pipeline: Word and Excel source tables become structured JSON and Excel, are joined with administrative GeoJSON, and can be inspected in table, hierarchy and map views.”
- The repository contains no datasets. Source-document editions, status dates, geometry reference dates and package dates should be recorded separately when preparing data.
- This is a draft for review; no LinkedIn post has been published.
