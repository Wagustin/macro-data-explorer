#!/usr/bin/env python3
import os
import subprocess
from fontTools.ttLib import TTFont

UNICODES = (
    "U+0020-007E,"        # Basic Latin (ASCII printable)
    "U+00A0-00FF,"        # Latin-1 Supplement (á, é, í, ó, ú, ñ, ¿, ¡, «, », ·, etc.)
    "U+2013,U+2014,"      # – (en-dash), — (em-dash)
    "U+2018,U+2019,U+201A," # ‘ ’ ‚
    "U+201C,U+201D,U+201E," # “ ” „
    "U+2022,"             # • bullet
    "U+2026,"             # … ellipsis
    "U+20AC,"             # € euro
    "U+2122,"             # ™ trademark
    "U+2191,U+2193,"      # ↑ ↓ arrows
    "U+2212,"             # − minus
    "U+2009,U+202F"       # thin space, narrow no-break space
)

LAYOUT_FEATURES = "kern,liga,locl,tnum,pnum"

FONTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fonts"))
PUBLIC_FONTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public", "fonts"))

def subset_font(filename):
    src_path = os.path.join(FONTS_DIR, filename)
    tmp_path = os.path.join(FONTS_DIR, filename + ".tmp")
    
    cmd = [
        "pyftsubset",
        src_path,
        f"--unicodes={UNICODES}",
        f"--layout-features={LAYOUT_FEATURES}",
        "--flavor=woff2",
        f"--output-file={tmp_path}"
    ]
    
    subprocess.run(cmd, check=True)
    
    old_size = os.path.getsize(src_path)
    new_size = os.path.getsize(tmp_path)
    
    # Verify with fontTools
    font = TTFont(tmp_path)
    glyph_count = len(font.getGlyphOrder())
    
    os.replace(tmp_path, src_path)
    
    # Also sync to public/fonts if exists
    if os.path.exists(PUBLIC_FONTS_DIR):
        pub_path = os.path.join(PUBLIC_FONTS_DIR, filename)
        with open(src_path, "rb") as f_in, open(pub_path, "wb") as f_out:
            f_out.write(f_in.read())
            
    print(f"✓ {filename}: {old_size/1024:.1f} KB -> {new_size/1024:.1f} KB ({glyph_count} glyphs)")

def main():
    woff2_files = [f for f in sorted(os.listdir(FONTS_DIR)) if f.endswith(".woff2")]
    print(f"Subsetting {len(woff2_files)} WOFF2 fonts with pyftsubset...")
    for f in woff2_files:
        subset_font(f)

if __name__ == "__main__":
    main()
