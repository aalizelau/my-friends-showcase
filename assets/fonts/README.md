# Notebook handwriting

Used only for friend names and the authored focus-bubble text. Interface labels,
profile notes, and the bubble's attribution keep the existing UI typeface.

- **Gloria Hallelujah**, regular 400, Kimberly Geswein. Original Google Fonts
  binary: https://github.com/google/fonts/tree/main/ofl/gloriahallelujah
- **LXGW WenKai TC / 霞鶩文楷 TC**, regular 400. Original upstream binary:
  https://github.com/lxgw/LxgwWenkaiTC/tree/main/fonts/TTF
  Selected for its pen-written Traditional Chinese forms and common Cantonese
  character coverage, including Hong Kong supplementary characters.

Downloaded 2026-08-30. Both unmodified font files are bundled with their SIL
Open Font License in the corresponding folder. Full fonts are kept so new
names and bubble text do not depend on a fixed content subset. The CSS places
Gloria first for Latin and lets Chinese glyphs fall through to WenKai TC.
All loading is local; no personal text is sent to a font service.
