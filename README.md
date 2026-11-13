# PolarisDX – Kontaktformular (Druck + Online + QR-Code)

## Was ist drin

| Datei | Wofür |
|---|---|
| `output/PolarisDX_Kontaktformular_DE.pdf` | Neu gestaltetes Formular zum Ausdrucken (A4, Deutsch). Der QR-Code unten rechts öffnet das Online-Formular auf Deutsch. |
| `output/PolarisDX_Contact-Form_EN.pdf` | Dasselbe auf Englisch. Der QR-Code öffnet das englische Online-Formular. |
| `output/PolarisDX_QR-Aufsteller_A4.pdf` | Aufsteller/Poster mit großem QR-Code („Scan me“) für Stand, Empfang oder Tisch (auf 71 % gedruckt = A5). |
| `output/qr/` | QR-Codes einzeln: SVG für den Druck, PNG für Folien, E-Mail-Signatur usw. |
| `docs/` | Das Online-Formular (Englisch, mit Umschalter DE). Anfragen gehen per E-Mail an **adrianoz@polarisdx.net**. |
| `output/vorschau/` | Vorschaubilder (Handy, Desktop, Druck). |

## Online schalten (einmalig, ca. 2 Minuten)

1. **Repo öffentlich machen oder GitHub Pro nutzen:** GitHub Pages gibt es bei kostenlosen Konten nur für
   öffentliche Repos. Settings → General → ganz unten *Danger Zone* → **Change visibility** → Public.
   (Die Formularseite selbst ist ohnehin öffentlich.)
2. **GitHub Pages einschalten:** Settings → Pages → *Build and deployment* → Source **Deploy from a branch** →
   Branch **`claude/zen-ramanujan-yhuewb`** (oder `main`, wenn der Branch gemergt ist), Ordner **`/docs`** → **Save**.
3. Nach ca. 1 Minute ist das Formular erreichbar:
   - Englisch: <https://adrianozuccalahh-wq.github.io/polarisdx-kontaktformular/>
   - Deutsch: <https://adrianozuccalahh-wq.github.io/polarisdx-kontaktformular/de/>
4. **E-Mail-Weiterleitung aktivieren:** Formular einmal selbst ausfüllen und absenden. FormSubmit schickt dann
   eine Mail *„Activate Form“* an adrianoz@polarisdx.net → Button klicken. Ab jetzt kommt jede Anfrage direkt ins
   Postfach (Anfragen von vor der Aktivierung werden 30 Tage aufgehoben und dann zugestellt). Falls nichts kommt:
   Spam-Ordner prüfen und als „kein Spam“ markieren.
5. Erst danach drucken: die QR-Codes zeigen genau auf die Adressen oben.

## Was du pro Anfrage bekommst

Eine E-Mail mit Betreff **„New contact request: ‹Name›“** und einer Tabelle: Name, Address, Phone, email, Request,
Language, Consent. **„Antworten“ geht direkt an den Kunden** (Reply-To ist seine Adresse).

## Empfohlen: E-Mail-Adresse aus dem Quelltext nehmen

Die Adresse steht im Quelltext der Formularseite (so funktioniert FormSubmit ohne Anmeldung). Nach der Aktivierung
bekommst du von FormSubmit einen Zufallscode. Den in `config.json` bei `recipient` statt der Adresse eintragen und
neu bauen, dann sehen Spam-Bots die Adresse nicht mehr.

## Ändern und neu bauen

Alles Einstellbare steht in `config.json`:

- `formUrl` – Adresse, unter der das Formular liegt (QR-Codes zeigen dorthin; mit `/` am Ende)
- `recipient` – E-Mail-Adresse oder FormSubmit-Zufallscode
- `privacyUrl` – Link zur Datenschutzerklärung (leer = kein Link)

Voraussetzungen: Node 18+, Playwright mit Chromium, Python 3 mit `fonttools`, `zxing-cpp`, `Pillow`.

```bash
cd tools && npm install && node build.mjs && node test-form.mjs
```

`build.mjs` erzeugt Webseite, PDFs, QR-Codes und Vorschauen neu und prüft jeden QR-Code mit zwei unabhängigen
Lesern (ZXing, jsQR), auch klein, unscharf und schräg fotografiert. `test-form.mjs` testet das Online-Formular
im Browser (Pflichtfelder, Senden, Server-Fehler, kein Netz, Spam-Bots, Sprachen); dabei wird nichts verschickt.

**Anderer Speicherort** (z. B. eure Firmen-Website): `docs/index.html` (und `docs/de/index.html`) dort hochladen,
`formUrl` anpassen, neu bauen, neue PDFs drucken.

**Original-Logo:** Das Logo ist aus einem Foto des gedruckten Formulars als Vektorgrafik nachgebaut. Wenn ihr die
Original-Datei habt, `src/logo/logo.svg` (und `mark.svg` für den Punktring) ersetzen und neu bauen.

## Datenschutz (Hinweise, keine Rechtsberatung)

- Die Formularseite lädt nichts von fremden Servern (Schrift ist eingebettet, keine Google Fonts, kein Tracking).
- Beim Absenden gehen die Angaben über **FormSubmit** (externer Dienst) an euer Postfach. Das gehört in die
  Datenschutzerklärung; den Link dazu über `privacyUrl` eintragen.
- Online und auf Papier ist eine Einwilligungs-Checkbox enthalten; online ist sie Pflicht.

## Aufbau

```
config.json            Einstellungen
docs/                  fertiges Online-Formular (Wurzel für GitHub Pages)
src/web/index.html     Vorlage Online-Formular
src/print/form.html    Vorlage Druckformular (DE/EN)
src/print/sign.html    Vorlage QR-Aufsteller
src/logo/              Logo (Vektor); src/fonts/ Schrift Figtree (SIL Open Font License)
tools/                 build.mjs, test-form.mjs, verify-qr.mjs, qr.mjs, make_logo.mjs, make_fonts.py
output/                fertige PDFs, QR-Codes, Vorschauen
```
