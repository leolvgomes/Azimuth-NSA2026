"""Injects the CTX preview PNG (base64) into 03-telas.html -> 03-telas.built.html.
usage: python -I build-telas.py <ctx_preview.png>"""
import base64, pathlib, sys

here = pathlib.Path(__file__).parent
png = pathlib.Path(sys.argv[1]).read_bytes()
uri = 'data:image/png;base64,' + base64.b64encode(png).decode()
src = (here / '03-telas.html').read_text(encoding='utf-8')
(here / '03-telas.built.html').write_text(src.replace('%%CTX%%', uri), encoding='utf-8')
print('ok', len(uri))
