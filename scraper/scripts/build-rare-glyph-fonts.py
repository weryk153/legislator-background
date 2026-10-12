"""Build the small name fallback fonts: python3 this-file.py /path/to/Fonts_Sung.zip.
Requires fonttools and brotli. Source: https://www.cns11643.gov.tw/opendata/Fonts_Sung.zip
License: OFL-1.1 (chosen from the source's dual license). See public/fonts/cns-sung-LICENSE.txt.
"""
import io
from pathlib import Path
import sys
from zipfile import ZipFile
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
GROUPS = [
    ('TW-Sung-98_1.ttf', '㳵䧮寪', 'bmp'),
    ('TW-Sung-Ext-B-98_1.ttf', '𠧊𡍼𫎇𬧷', 'ext'),
]
with ZipFile(sys.argv[1]) as archive:
    for source, chars, label in GROUPS:
        font = TTFont(io.BytesIO(archive.read(source)))
        expected = {ord(c) for c in chars}
        assert expected <= set(font.getBestCmap()), f'Missing source glyph: {chars}'
        options = subset.Options()
        options.name_IDs = ['*']
        options.name_languages = ['*']
        sub = subset.Subsetter(options=options)
        sub.populate(unicodes=expected)
        sub.subset(font)
        # Explicit derivative name; preserve all source copyright/license records.
        for record in font['name'].names:
            if record.nameID in (1, 3, 4, 6, 16):
                record.string = ('CivicRareGlyphs-' + label if record.nameID == 6
                                 else 'Civic Rare Glyphs ' + label)
        font.flavor = 'woff2'
        output = ROOT / 'src/assets/fonts' / f'civic-rare-{label}.woff2'
        output.parent.mkdir(parents=True, exist_ok=True)
        font.save(output)
        assert set(TTFont(output).getBestCmap()) == expected
        print(f'{output.name}: {output.stat().st_size} bytes, {chars}')
