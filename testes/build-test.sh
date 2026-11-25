#!/bin/bash
# Monta uma cópia de teste do site (pasta site/) com o SDK local e a configuração dos emuladores.
set -e
cd "$(dirname "$0")"
cp ../firestore.rules rules-copy.rules
rm -rf site && mkdir site
for f in index.html app.js escala-parser.js style.css manifest.webmanifest sw.js logo-completa.png logo-simbolo.png icone-192.png icone-512.png; do cp "../$f" site/; done
cat > site/firebase-config.js <<'X'
export const firebaseConfig = { apiKey: "fake-key", authDomain: "localhost", projectId: "demo-samu", appId: "1:1:web:1" };
X
sed -i 's#https://www.gstatic.com/firebasejs/10.12.2/firebase-\([a-z]*\).js#firebase/\1#g' site/app.js
node_modules/.bin/esbuild site/app.js --bundle --format=esm --outfile=site/app.bundle.js --log-level=warning
mv site/app.bundle.js site/app.js
cp node_modules/jspdf/dist/jspdf.umd.min.js site/jspdf.js
cp node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js site/autotable.js
sed -i 's#https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js#jspdf.js#; s#https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js#autotable.js#; /fonts.googleapis/d' site/index.html
mkdir -p site/pdfjs && cp node_modules/pdfjs-dist/build/pdf.min.js node_modules/pdfjs-dist/build/pdf.worker.min.js site/pdfjs/
sed -i 's#https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/#pdfjs/#' site/app.js
mkdir -p shots
