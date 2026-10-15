# foreLas — 激光点云林木分析系统

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r128-000000?logo=three.js)](https://threejs.org/)
[![Version](https://img.shields.io/badge/version-2.1.0-brightgreen.svg)](#quick-start)

**foreLas** is an open-source, browser-based platform for processing forest LiDAR point clouds at the individual-tree and stand levels. All computation runs entirely on the client side — no installation, no server, no programming knowledge required, and point cloud data never leaves the user's device.

**版权所有：贵州嘉绿科技咨询有限公司。**

**访问路径：** `/foreLas/`；本地开发地址为 `http://localhost:5173/foreLas/`。

## Features

- **LAS file parsing** — versions 1.2–1.4, point data record formats 0–10, with correct classification handling for the LAS 1.4 formats 6–10 (see *Notes on LAS parsing* below)
- **Interactive 3D/2D visualization** with WebGL (Three.js), with point colouring by height, normalized height, RGB, intensity, classification, or tree segment
- **Height normalization** — grid-based minimum-Z with gap filling, or an external DTM (GeoTIFF, ESRI ASCII grid, or XYZ ground points)
- **Spatial clipping** — circular or rectangular regions of interest
- **CHM-based individual tree detection** — local-maxima seeds with a fixed or variable window size (VWS), followed by height-ranked region growing
- **Variable window size** — four presets (Pine, Deciduous, Combined, Linear-boreal) plus a custom-coefficient entry (linear or quadratic) for site-specific calibration
- **Crown projection** — bounding box, convex hull, or concave hull (KNN-based)
- **Area-based metrics** — height percentiles (H5–H99), density ratios (D1–D9), canopy cover (CC₁.₃), and variability statistics
- **Allometric DBH estimation** for 8 Turkish tree species
- **Aboveground biomass** for *Pinus brutia* (five components)
- **Vertical transect profile** analysis
- **Multi-format export** (CSV, PNG)
- **Bilingual UI** (English/Turkish), fully offline after first load

## Quick start

### Access the application
开发服务启动后，访问 [localhost:5173/foreLas/](http://localhost:5173/foreLas/)。部署时使用 `/foreLas/` 路径；公开域名由实际部署环境确定。

### Run locally
Prerequisite: Node.js 18+ (20 LTS recommended)

```bash
cd foreLas
npm install
npm run dev
```

### Build for production
```bash
npm run build
npm run preview
```

## Notes on LAS parsing

- The classification field is read from byte 15 for the legacy point formats 0–5 and from byte 16 for the LAS 1.4 formats 6–10, where the field is relocated.
- To preserve precision for projected coordinates with large values (e.g. UTM northings), absolute coordinates are reduced by a double-precision local origin before being stored as single-precision floats. The origin is retained internally so that absolute coordinates are reconstructed for CSV export and external-DTM matching.
- Small LAS files covering formats 0–3 and 6–8 are provided in [`test_data/`](test_data/) together with the generator script [`test_data/make_test_las.R`](test_data/make_test_las.R). Each file contains a flat ground surface (class 2) and three tree clusters (class 5). Load a file and set the point colouring to *Classification*: the ground should render brown and the tree clusters green in every format. Reading the classification byte from the wrong offset makes the two groups collapse into a single colour, so this is a direct check of the LAS 1.4 handling. The colour-carrying formats (2, 3, 7, 8) store the same brown/green pattern as RGB, which likewise checks the per-format colour offset (byte 20, 28 and 30 respectively).

## Reproducing the upstream FORA validation

以下保留原始 FORA 的验证资料、数据文件名及脚本变量名，用于追溯来源。

The full validation can be reproduced with [`validation/fora_validation.R`](validation/fora_validation.R). It covers:

1. **Cross-tool agreement** over eight UAV-LiDAR datasets. FORA's exported per-tree metrics are compared against three lidR algorithms (`dalponte2016`, `silva2016`, `watershed`).
2. **Window-size settings** on the tallest dataset (EN23611_2): lidR is run under a fixed window and four crown-width functions, each compared with FORA's own tree set for that dataset.

In both parts the comparison set is FORA's own output, so the reported statistics describe cross-tool agreement, not accuracy against ground truth.

### Matching rule

For each FORA tree, the nearest lidR tree within 5 m that has not already been used is selected, so each lidR tree is matched at most once (greedy, one-to-one). Segments with fewer than five points are dropped on both sides. Positions are the crown bounding-box centre on the FORA side and the segment centroid on the lidR side; both approximate the stem position, and the mean matching distance is about 1 m.

### Exporting from FORA

Run each dataset with the default parameters (CHM cell 0.5 m, minimum height 2 m, search radius 3 m) and leave crown projection on **bounding box**, which is what the script's crown-diameter formula assumes. Export the tree metrics CSV and name it `FORA_<dataset>_metrics.csv`. The script accepts both the current column names (`H_auto`, `CD_auto`) and the older ones (`H_m`, `CD_m`).

### Inputs and clipping

Set the three paths at the top of the script:

- `las_dir` — `<id>_treesonly.laz` and `<id>_ground_classification.laz` per dataset
- `fora_dir` — the FORA metric exports
- `out_dir` — where tables and figures are written

Six of the datasets are clipped to a square around a given centre. The point cloud is clipped to twice the side of the reference square so that crowns at the edge of the reference area remain complete; the comparison itself only involves trees present in the FORA export.

### Validation data

The eight datasets are openly available from PANGAEA and were located with a search restricted to the DJI Matrice 300 RTK / YellowScan Mapper acquisition method:

- Yakutia, Russia 2021 — https://doi.org/10.1594/PANGAEA.980735
- Northwestern Canada 2022 — https://doi.org/10.1594/PANGAEA.977771
- Eastern Alaska 2023 — https://doi.org/10.1594/PANGAEA.980485
- Western and central Alaska 2024 — https://doi.org/10.1594/PANGAEA.980757

Each archive provides ground-classified point clouds and per-site vegetation returns; the files used here are the `_treesonly` and `_ground_classification` products for the eight sites listed in the article.

## Citation

foreLas 2.1.0 的维护与修改版权归贵州嘉绿科技咨询有限公司；原始项目来源为 [FORA](https://github.com/fora-platform/fora)。下列归档引用信息仅对应原始 FORA，当前 foreLas 尚未关联独立 DOI。

If you use the upstream FORA, please cite the archived release (see [`CITATION.cff`](CITATION.cff)) and the SoftwareX article once published. The concept DOI [10.5281/zenodo.19546162](https://doi.org/10.5281/zenodo.19546162) always resolves to the latest version; each release also has its own version DOI.

## License

MIT — see [`LICENSE`](LICENSE).
