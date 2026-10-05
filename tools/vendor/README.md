# Browser libraries

These local copies let `prepare_data.html` run directly from disk and offline.
Retain the upstream license headers and accompanying license files.

| File | Upstream / version | License |
| --- | --- | --- |
| `xlsx.full.min.js` | SheetJS CE 0.18.5, https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js | Apache-2.0 |
| `jszip.min.js` | JSZip 3.10.1, https://github.com/Stuk/jszip | MIT (chosen from MIT / GPLv3) |
| `lucide.js` | Lucide 1.49.0, https://unpkg.com/lucide@1.49.0/dist/umd/lucide.js | ISC |
| `tailwind.js` | Tailwind Play CDN browser build, https://cdn.tailwindcss.com | MIT |

The XLSX, JSZip and Tailwind sources match the libraries already used by this
converter; Lucide was previously loaded from the latest-version CDN endpoint.
