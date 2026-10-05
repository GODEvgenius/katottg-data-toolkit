# LinkedIn draft — English

From fragmented Word tables to a reusable administrative dataset.

I'm sharing **KATOTTG Data Toolkit**, a project focused on preparing Ukraine's administrative and territorial-status data — and making the result easier to inspect.

The workflow brings together three types of input:

• The KATOTTG codifier: administrative codes, names and parent relationships.
• Official territorial-status tables: occupation or hostilities categories, dates and information-system availability.
• Administrative-boundary GeoJSON: the geographic layer used to connect the prepared records to a map.

The preparation tool reads multiple Word and Excel files, detects tables and columns, handles merged cells, joins records by full KATOTTG code, merges duplicates and preserves source references and status histories. The result can be downloaded as JSON, a merged Excel workbook or a package with enriched GeoJSON.

One detail matters: summaries for regions, districts and communities are calculated from their level-4 records. They show exact affected/total counts and distinguish fully controlled, mixed and fully affected territories. The same summary is used across the hierarchy, object cards and map.

The related service, **“ATU objects with occupation-status data,”** makes it possible to browse subordinate objects, find an identifier or status, filter results and switch between table, hierarchy and map views.

Existing service: https://ontonew.snman.science/katottg/index.html
Repository: https://github.com/GODEvgenius/katottg-data-toolkit

The public repository contains the software and documentation, without source datasets or geographic records. Users supply their own inputs. Source references include the official KATOTTG publication page, the territorial-status list under Order No. 376, and HDX Ukraine COD-AB as an administrative-boundary source option.

I'd welcome feedback on the import workflow, source tracking and ways to make these datasets easier to reuse.

#OpenData #DataPreparation #DataEngineering #GIS #Ukraine

---

## Publication notes

- Repository: https://github.com/GODEvgenius/katottg-data-toolkit
- Attach `docs/assets/linkedin-data-pipeline.png`.
- Suggested image alt text: “KATOTTG Data Toolkit pipeline: Word and Excel source tables become structured JSON and Excel, are joined with administrative GeoJSON, and can be inspected in table, hierarchy and map views.”
- The repository contains no datasets. Source-document editions, status dates, geometry reference dates and package dates should be recorded separately when preparing data.
- This is a draft for review; no LinkedIn post has been published.
