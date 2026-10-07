# CLAUDE.md — Spraakgestuurde AI-Agenda

Dit bestand geeft Claude Code de vaste context voor dit project. Lees het bij elke sessie.

## Project in het kort
Een installeerbare webapp (PWA) voor de iPhone: de gebruiker spreekt in, AI in de browser zet het om naar agenda-kaartjes (afspraak, to-do, idee, persoonlijk) in een dag- of weekoverzicht. Alles draait en blijft **lokaal op de iPhone**. Gebouwd op een Windows-laptop, gehost via GitHub Pages.

De volledige specificatie staat in @requirements.md. Bij twijfel is requirements.md leidend. Verwijs in commits en uitleg naar requirement-ID's (bijv. `AI-02`, `SEC-04`).

## Over de opdrachtgever
- De opdrachtgever is geen ontwikkelaar. Leg elke stap in eenvoudig Nederlands uit: wat je gaat doen, waarom, en wat zij daarna moet doen of testen.
- Vraag toestemming voordat je grote keuzes maakt die niet in requirements.md staan.
- Sluit elke taak af met een korte samenvatting en concrete testinstructies voor de iPhone.
- De opdrachtgever wil analytics translator / data-analist worden en moet de code zelf kunnen uitleggen:
  - Houd **`docs/UITLEG.md`** bij elke wijziging bij: per bestand, per regelbereik, wat er gebeurt en **waarom** ("in regels X–Y doen we dit, zodat …"). Werk regelnummers bij als een bestand verandert. Een commit is pas af als UITLEG.md klopt.
  - Loop **na elke afgeronde fase alle bestanden** stap voor stap met de opdrachtgever door, bestand voor bestand, met ruimte voor vragen.

## Harde regels (nooit van afwijken)
1. **Geen netwerkverkeer met gebruikersdata.** Geen `fetch`/XHR/WebSocket naar externe domeinen. Geen externe AI-API's (Groq, Anthropic, OpenAI e.d.).
2. **Geen server.** Next.js met `output: 'export'`; geen API-routes, geen server actions, geen middleware.
3. **Geen derde partijen in de browser:** geen CDN's, Google Fonts, analytics, trackers, cookies of crashrapportage. Lettertypen, iconen en AI-modellen worden zelf gehost vanaf hetzelfde domein.
4. **Strikte CSP** (`SEC-02`): `default-src 'self'; connect-src 'self'`. Pas de CSP nooit aan om een externe bron toe te staan.
5. **Alle gebruikersdata versleuteld** in IndexedDB (`SEC-04`, `SEC-05`): AES-GCM via Web Crypto, sleutel via PBKDF2 uit de pincode, sleutel alleen in het werkgeheugen.
6. **Nooit opslaan:** pincode, sleutel, filterstatus (`NAV-04`).
7. **AI-uitvoer altijd als platte tekst renderen.** Nooit `dangerouslySetInnerHTML`.
8. **Datums altijd via de eigen Nederlandse parser** (`AI-02`, `AI-08`), nooit door een taalmodel laten berekenen.
9. Geen geheimen, sleutels of persoonlijke data in de repository; de repo is openbaar.
10. Nieuwe npm-pakketten alleen toevoegen als ze nodig zijn; benoem waarom en controleer dat ze geen netwerkverbindingen maken.

## Tech stack
- Next.js (App Router, TypeScript, `output: 'export'`) + Tailwind CSS
- PWA: Web App Manifest + Service Worker (Serwist), volledig offline
- Spraak: `@huggingface/transformers` (Whisper, WebGPU met WASM-fallback) in een Web Worker
- Regels: eigen Nederlandse datumparser + trefwoordclassificatie (laag 1)
- Optioneel later: WebLLM (Slimme modus, fase 5)
- Opslag: IndexedDB via Dexie, versleuteld
- UI: Framer Motion, `@dnd-kit`
- Validatie: `zod`
- Tests: Vitest (vooral de datumparser en versleuteling)

## Mappenstructuur (richtlijn)
```
/app                 pagina's en layout
/components          UI-componenten (kaartjes, sheets, header, FAB)
/lib/parser          Nederlandse datum/tijd-parser + tests
/lib/classify        titel, type en samenvatting (regels)
/lib/crypto          sleutelafleiding, versleutelen, ontsleutelen
/lib/db              Dexie-schema en opslagfuncties
/lib/reminders       herinneringslogica + .ics-generatie
/workers             Whisper-worker
/public/models       zelf gehoste modelbestanden
/public/icons        app-iconen
```

## Commando's
- `npm install` — afhankelijkheden installeren
- `npm run dev` — lokaal draaien op de laptop
- `npm run build` — statische export naar `/out`
- `npm test` — tests draaien
- `npm audit` — beveiligingscontrole vóór elke publicatie (`SEC-17`)

## GitHub Pages
- Publiceren via GitHub Actions naar GitHub Pages.
- Stel `basePath` en `assetPrefix` in op de repositorynaam.
- Voeg een leeg `.nojekyll`-bestand toe aan de export.
- Testen op de iPhone gebeurt via de GitHub Pages-URL (de microfoon werkt alleen via https).
- Modelbestanden groter dan de GitHub-limiet opsplitsen in delen.

## Doeltoestel
iPhone 15 Pro of nieuwer. Test en optimaliseer hierop: standaard `whisper-small`, Slimme modus (fase 5) is haalbaar.

## Verplichte herinnering: terugkerende afspraken (REC-01 t/m REC-09)
Terugkerende afspraken moeten **sowieso** gebouwd worden, gepland in fase 6.
- Voeg het veld `recurrence` (en `exceptions`) al in fase 1 toe aan het datamodel, zodat er later geen migratie nodig is.
- Herinner de opdrachtgever hieraan **aan het einde van elke afgeronde fase** met één regel, bijvoorbeeld: "Nog open en verplicht: terugkerende afspraken (fase 6)."
- Herinner ook als er iets wordt gebouwd dat ermee samenhangt (datumparser, drag & drop, herinneringen, `.ics`-export), zodat het ontwerp er rekening mee houdt.
- Stop met herinneren zodra fase 6 is afgerond en getest.

## Werkwijze
- Werk **fase voor fase** volgens §12 van requirements.md. Begin met **fase 0** (haalbaarheidstest: opnemen → Whisper → tekst op de iPhone) en ga pas door als de opdrachtgever dat bevestigt.
- Kleine, afgeronde stappen; na elke stap een commit met een duidelijke Nederlandse omschrijving en de requirement-ID's.
- Schrijf tests voor de datumparser met de voorbeelden uit requirements.md (o.a. "volgende week dinsdag om twee uur 's middags", "half drie", "kwart over tien", "overmorgen").
- Controleer na elke fase de acceptatiecriteria uit §13 die bij die fase horen.

## Conventies
- Code, variabelen en commentaar in het Engels; alle teksten in de app in het Nederlands.
- Tijdzone altijd `Europe/Amsterdam`.
- Kleuren uit §5 van requirements.md als Tailwind-tokens (`appointment`, `todo`, `idea`, `personal`), met varianten voor dark en light.
- Respecteer `prefers-reduced-motion` en de veilige zones van de iPhone.
