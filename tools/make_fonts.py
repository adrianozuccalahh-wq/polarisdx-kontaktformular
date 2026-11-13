"""Make small static Figtree instances (SIL Open Font License) for the print templates and the web form.

Input : tools/.cache/Figtree[wght].ttf  (from github.com/google/fonts, ofl/figtree)
Output: src/fonts/Figtree-<Weight>.woff2  (Latin subset, committed)
        tools/.cache/Figtree-<Weight>.ttf (full static instance, used to outline the wordmark)
"""
import pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / ".cache" / "Figtree[wght].ttf"
OUT = HERE.parent / "src" / "fonts"
LATIN = ("U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,"
         "U+2000-206F,U+2074,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+2713,U+FEFF,U+FFFD")
WEIGHTS = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}

for wght, name in WEIGHTS.items():
    font = instancer.instantiateVariableFont(TTFont(SRC), {"wght": wght})
    ttf = HERE / ".cache" / f"Figtree-{name}.ttf"
    font.save(ttf)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt", "lnum", "tnum", "case"]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(LATIN))
    f2 = TTFont(ttf)
    sub.subset(f2)
    out = OUT / f"Figtree-{name}.woff2"
    subset.save_font(f2, out, opts)
    print(out.name, out.stat().st_size, "bytes")
