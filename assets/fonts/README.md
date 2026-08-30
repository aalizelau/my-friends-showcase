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

## Website title

**Mountains of Christmas**, bold 700, is used only for the “My Friends” header.
The original Google Fonts binary and Apache 2.0 license are bundled in
`mountains-of-christmas/`, downloaded 2026-08-30 from
https://github.com/google/fonts/tree/main/apache/mountainsofchristmas.
The real bold face is used, with synthetic bold disabled. All loading is local.

### Previous title font (not loaded)

**Melted Ideas**, regular 400, Eko Bimantara, is retained as an unused previous
option. Downloaded 2026-08-30 from https://www.dafont.com/melted-ideas.font
(archive: https://dl.dafont.com/dl/?f=melted_ideas).

The original, unmodified OpenType font and its supplied `Read Me.txt` are kept
in `melted-ideas/`. The author permits personal and commercial use but prohibits
reselling or modifying the font or deriving new font software from it.
