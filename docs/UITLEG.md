# UITLEG — wat staat waar, en waarom

Dit document legt **elk bestand** van de Spraak-agenda uit: per regelbereik wat er gebeurt en **waarom** het zo gebouwd is. Het wordt bij elke wijziging bijgewerkt.

> **Zo lees je dit document**
> - "Regels 10–20" verwijst naar de regelnummers die je in VS Code links naast de code ziet.
> - Requirement-ID's zoals `AI-02` of `SEC-01` verwijzen naar [requirements.md](../requirements.md).
> - De code en het commentaar in de code zijn in het Engels (afspraak in CLAUDE.md); alles in de app en in dit document is Nederlands.

**Laatst bijgewerkt:** fase 1, stap 1 (datumherkenning, correctielijst, titel en type).

---

## Inhoud

1. [Het grote plaatje](#1-het-grote-plaatje)
2. [Begrippen](#2-begrippen)
3. [De "hersenen": tekst → kaartje](#3-de-hersenen-tekst--kaartje)
   - [lib/parser/calendar.ts](#libparsercalendarts)
   - [lib/parser/dutch-date.ts](#libparserdutch-datets)
   - [lib/classify/corrections.ts](#libclassifycorrectionsts)
   - [lib/classify/cleanup.ts](#libclassifycleanupts)
   - [lib/classify/classify.ts](#libclassifyclassifyts)
   - [De tests (*.test.ts)](#de-tests-testts)
4. [Spraak → tekst (Whisper)](#4-spraak--tekst-whisper)
   - [lib/audio/recorder.ts](#libaudiorecorderts)
   - [workers/whisper.worker.ts](#workerswhisperworkerts)
   - [lib/whisper/messages.ts](#libwhispermessagests)
   - [lib/whisper/split-fetch.ts](#libwhispersplit-fetchts)
5. [Het scherm](#5-het-scherm)
   - [app/layout.tsx](#applayouttsx)
   - [app/globals.css](#appglobalscss)
   - [app/page.tsx](#apppagetsx)
   - [components/FeasibilityTest.tsx](#componentsfeasibilitytesttsx)
6. [Bouwen en publiceren](#6-bouwen-en-publiceren)
   - [scripts/fetch-models.mjs](#scriptsfetch-modelsmjs)
   - [scripts/copy-ort.mjs](#scriptscopy-ortmjs)
   - [config/models.json](#configmodelsjson)
   - [.github/workflows/deploy.yml](#githubworkflowsdeployyml)
   - [next.config.ts](#nextconfigts)
7. [Instellingenbestanden](#7-instellingenbestanden)

---

## 1. Het grote plaatje

De app is een **datapijplijn**: gegevens gaan stap voor stap door een reeks bewerkingen.

```
 🎤 microfoon
   │  lib/audio/recorder.ts         opnemen + omzetten naar 16 kHz
   ▼
 🔢 audio als getallen
   │  workers/whisper.worker.ts     Whisper (AI) op de telefoon
   ▼
 📝 ruwe tekst ("transcript")
   │  lib/classify/corrections.ts   bekende Whisper-fouten verbeteren
   │  lib/parser/dutch-date.ts      datum en tijd vinden
   │  lib/classify/classify.ts      type en titel bepalen
   │  lib/classify/cleanup.ts       nette samenvatting maken
   ▼
 🗂️ kaartje (titel, type, datum, tijd, samenvatting)
```

Alles gebeurt **op de iPhone**. Er gaat geen enkel gegeven naar een server (SEC-01).

## 2. Begrippen

| Begrip | Uitleg |
|---|---|
| **Transcript** | De letterlijke tekst die Whisper van je stem maakt. |
| **Parser** | Een stuk code dat tekst "ontleedt" en er gestructureerde informatie uit haalt (hier: datum en tijd). |
| **Regex** (reguliere expressie) | Een zoekpatroon voor tekst. `\bmorgen\b` betekent bijvoorbeeld "het losse woord morgen". `\b` = woordgrens. |
| **Laag 1** | De regels en woordenlijsten die zonder taalmodel werken. Altijd actief. |
| **Laag 2** | Optioneel taalmodel ("Slimme modus"), komt in fase 5. |
| **Test** | Een stukje code dat controleert of andere code het juiste antwoord geeft. `npm test` draait alle tests. |
| **ISO-datum** | Een datum als `2026-10-13` (jaar-maand-dag). Zo sorteren datums vanzelf goed als tekst. |
| **Web Worker** | Een apart "werkpaard" in de browser dat zwaar rekenwerk doet zonder dat het scherm vastloopt. |
| **CSP** | Content Security Policy: een lijst regels waarmee de browser verbindingen naar andere websites blokkeert. |

---

## 3. De "hersenen": tekst → kaartje

### lib/parser/calendar.ts

**Wat:** kleine rekenhulpjes voor datums, zoals "dag erbij optellen" en "welke weekdag is het".

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 1–4 | Uitleg bovenaan het bestand. | Zodat je meteen ziet waar het bestand voor is. |
| 6 | `TIME_ZONE = "Europe/Amsterdam"`. | De requirements (AI-02) schrijven deze tijdzone voor. Eén vaste plek, zodat we het nooit op twee plekken anders hebben. |
| 8–17 | `todayIso`: geeft de datum van vandaag **in Amsterdam** als `2026-10-07`. | Een computer rekent intern in UTC (wereldtijd). Om 00:30 's nachts in Nederland is het in UTC nog "gisteren". Zonder deze functie zou "morgen" dan de verkeerde dag zijn. |
| 19–26 | `toUtc` en `toIso`: omzetten tussen tekst (`2026-10-07`) en een datumobject. | We bewaren datums als tekst (makkelijk opslaan en vergelijken) en rekenen met datumobjecten. |
| 28–33 | `makeDate`: maakt een datum en geeft `null` als die niet bestaat. | Zo wordt "31 februari" netjes geweigerd in plaats van stilletjes 3 maart te worden. |
| 35–39 | `addDays`: dagen optellen. | Nodig voor "morgen" (+1), "over 3 dagen" (+3) enzovoort. |
| 41–50 | `addMonths`: maanden optellen, met de dag begrensd. | 31 januari + 1 maand bestaat niet; dan wordt het 28 of 29 februari. |
| 52–55 | `weekdayIndex`: maandag = 0 … zondag = 6. | In Nederland begint de week op maandag. JavaScript begint standaard op zondag; hier corrigeren we dat. |
| 57–60 | `startOfWeek`: de maandag van de week. | Nodig voor "volgende week dinsdag": maandag van deze week + 7 + 1. |

**Let op:** we rekenen bewust in UTC en zetten alleen "vandaag" om naar Amsterdam. Zo kan de **zomer- en wintertijd** nooit een dag laten verspringen. Dat is een klassieke bron van fouten in software.

### lib/parser/dutch-date.ts

**Wat:** de Nederlandse datumherkenning (AI-02). Vindt in een zin als *"volgende week dinsdag om twee uur 's middags"* de datum (`2026-10-13`) en tijd (`14:00`).

**Waarom regels in plaats van AI:** een regel geeft altijd hetzelfde, controleerbare antwoord. Een taalmodel kan zich "verrekenen" met datums. Daarom staat in AI-08 dat datums **altijd** door deze parser berekend worden.

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 1–7 | Uitleg, en een notitie dat herhalingen ("elke dinsdag") in fase 6 komen. | Herinnering voor terugkerende afspraken (REC-02). De opbouw (één patroon per soort zin) maakt het makkelijk om die later toe te voegen. |
| 11–20 | `ParsedDateTime`: de vorm van het antwoord: `date`, `time`, `spans` (waar in de zin de datumwoorden stonden), `conflict` en `vague`. | `spans` gebruiken we om de datumwoorden uit de titel te halen. `conflict` en `vague` zorgen voor het label "Controleer datum" (AI-06). |
| 22 | De vier dagdelen. | Nodig om "twee uur 's middags" (14:00) en "twee uur 's nachts" (02:00) uit elkaar te houden. |
| 26–39 | Getallen in woorden (`een` = 1 … `eenendertig` = 31). | Whisper schrijft soms "twee" en soms "2". AI-02 eist dat beide werken. Regels 34–39 maken de samengestelde getallen (eenentwintig, tweeëntwintig …) automatisch aan, zodat we ze niet allemaal hoeven uit te typen. |
| 41–44 | `NUM`: één zoekpatroon voor "een getal". Langste woorden eerst. | Anders vindt de computer in "eenentwintig" eerst "een" en stopt hij daar. |
| 46–56 | Weekdagen, maanden (met afkortingen als "okt") en dagdeel-achtervoegsels. | Zodat ook "dinsdagavond" en "12 okt" herkend worden. |
| 58–64 | `toNumber` en `toDaypart`: woord → getal, "morgen" → "ochtend". | "Morgenochtend" en "'s morgens" betekenen hetzelfde dagdeel. |
| 68–85 | `normalize`: kleine letters, accenten weg (`één` → `een`), en "'s middags" / "smiddags" → markering `@middag`. | Whisper schrijft dagdelen op allerlei manieren (in jouw iPhonetest: "smiddags"). We maken alles eerst gelijk, zodat de patronen daarna eenvoudig blijven. **Belangrijk:** elke vervanging is precies even lang als het origineel, zodat de posities (`spans`) nog kloppen met de oorspronkelijke zin. |
| 89–105 | `to24Hour`: "twee uur" + middag → 14. Zonder dagdeel worden 1 t/m 6 uur als middag gelezen. | Een afspraak om 2 uur 's nachts is zeldzaam, dus "om 2 uur" = 14:00. Dit is een **bewuste aanname**, en die staat in de tests vastgelegd. |
| 107–111 | `formatTime`: minuten → `"14:30"`. | Eén vaste notatie voor tijden. |
| 115–123 | Start van de parser: lijsten voor gevonden datums en tijden. Een tijd is een "ankeruur" plus een verschuiving in minuten. | "Half drie" = 3 uur − 30 minuten. "Kwart over tien" = 10 uur + 15. Zo werkt één rekenregel voor alle varianten. |
| 125–135 | `scan`: voert één patroon uit, onthoudt elke vondst en **wist die daarna** uit de werktekst. | Zodat een volgend patroon dezelfde woorden niet nog een keer vindt. Voorbeeld: "volgende week dinsdag" mag niet óók nog als losse "dinsdag" tellen. |
| 137–140 | `nextWeekday`: de eerstvolgende keer dat een weekdag voorkomt. | Voor "vrijdag" en "aanstaande zondag". |
| 142–146 | Stap 1: "morgenochtend", "vanavond". | Eerst de samengestelde woorden, anders vindt stap 2 alleen "morgen". |
| 148–151 | Stap 2: "vandaag", "morgen", "overmorgen". | "Overmorgen" staat vóór "morgen" in het patroon, zodat het langste woord wint. |
| 153–159 | Stap 3: "over 3 dagen / twee weken / een maand". | Relatieve datums uit AI-02. |
| 161–171 | Stap 4 en 5: "volgende week dinsdag" en alleen "volgende week". | Alleen "volgende week" krijgt maandag als datum, maar wordt als **vaag** gemarkeerd. Dan controleert de gebruiker de datum. |
| 173–185 | Stap 6: weekdagen, eventueel met "deze", "volgende" of "aanstaande". | "Woensdag" op een woensdag betekent volgende week. "Deze maandag" is de maandag van deze week, of de volgende als die al voorbij is. |
| 187–194 | Stap 7: "12 oktober", "3e januari 2027". | Zonder jaartal kiezen we de eerstvolgende keer (zie regels 256–264). |
| 196–202 | Stap 8: "12-10" en "12/10/2026". | Korte schrijfwijze van datums. |
| 204–208 | Stap 9: "14:00" en "9.30 uur". | Digitale tijden. |
| 210–216 | Stap 10: "kwart over tien", "vijf voor half drie". | De lastigste Nederlandse tijdsnotaties. |
| 218–223 | Stap 11: "half drie". | Let op: "half drie" = 2:30, niet 3:30. |
| 225–230 | Stap 12: "om 2 uur", maar **niet** "over 2 uur". | "Over 2 uur" is een tijdsduur, geen kloktijd. |
| 232–237 | Stap 13: "om twee" zonder "uur". | Mensen laten "uur" vaak weg. |
| 239–242 | Stap 14: losse dagdelen ("'s middags"). | Het dagdeel kan vóór of na de tijd staan. |
| 244–253 | Resultaat samenstellen. Twee **verschillende** datums of tijden = `conflict`. | AI-06: bij tegenstrijdige datums krijgt het kaartje "Controleer datum". Dezelfde datum twee keer (bijv. "vrijdag 9 oktober") is geen conflict. |
| 256–264 | `resolveDayMonth`: een datum zonder jaartal. | "3 januari" in oktober betekent volgend jaar, niet een datum die al voorbij is. |

### lib/classify/corrections.ts

**Wat:** de **correctielijst** met bekende fouten van Whisper.

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 1–3 | Uitleg: hoe je een nieuwe fout toevoegt. | Vind je op de iPhone een nieuwe fout, dan voeg je hier één regel toe en in [classify.test.ts](../lib/classify/classify.test.ts) een test. |
| 5–12 | De lijst: elke regel is *patroon → vervanging*. | Begonnen met de fouten uit jouw iPhonetest: "smiddags" → "'s middags" (regel 7) en "Tant Arts" → "tandarts" (regel 9). |
| 14–16 | `applyCorrections`: past alle regels na elkaar toe. | `reduce` betekent: begin met de tekst en pas elke correctie er één voor één op toe. |

**Let op (data-kwaliteit):** een correctielijst lost alleen fouten op die je **kent**. Houd daarom bij welke fouten je tegenkomt. Hoe vaker een fout voorkomt, hoe belangrijker hij is om toe te voegen.

### lib/classify/cleanup.ts

**Wat:** maakt van het ruwe transcript een nette samenvatting (AI-04, laag 1).

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 1–2 | Uitleg. | Het **exacte** transcript wordt apart bewaard en nooit veranderd (DET-03). Dit is alleen de nette versie. |
| 6–7 | Patroon voor stopwoorden: "eh", "ehm", "uhm". | Die zeg je wel, maar wil je niet lezen. |
| 9–17 | `cleanTranscript`: correctielijst toepassen, stopwoorden weg, dubbele spaties weg, hoofdletter aan het begin van elke zin, punt aan het eind. | Leesbaarheid. |

### lib/classify/classify.ts

**Wat:** het hart van laag 1. Bepaalt per transcript het **type**, de **titel**, de **datum/tijd** en of de datum **gecontroleerd** moet worden.

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 9 | De vier types: afspraak, todo, idee, persoonlijk. | Uit §5 van de requirements. |
| 11–18 | `Analysis`: de vorm van het resultaat. | Eén vaste vorm, zodat de rest van de app weet wat hij krijgt. |
| 22 | Woorden die op een **idee** wijzen ("misschien", "zou leuk zijn"). | AI-03. |
| 24–32 | Woorden die op een **afspraak** wijzen, met de titel die erbij hoort. | Woord en titel staan op één plek, dus als je een woord toevoegt, heb je meteen de titel. |
| 34–35 | Woorden die met "controle" samen één woord worden. | "Tandarts" + "controle" → "Tandartscontrole" (AI-01). |
| 37–41 | Woorden die op een **to-do** wijzen ("moet", "kopen", "bellen"). | AI-03. |
| 45 | Maximale titellengte: 40 tekens. | AI-01. |
| 47–49 | Beginwoorden zonder inhoud ("ik moet", "niet vergeten", "idee:"). | "Ik moet brood kopen" → titel "Brood kopen". |
| 51–61 | `capitalize` en `truncate`: hoofdletter, en inkorten zonder een woord doormidden te knippen. | Een titel als "Misschien zou het leuk zijn om naar Ro…" leest slecht. |
| 63–82 | `makeTitle` in vier stappen: (1) samenstelling met "controle", (2) "eten met Sanne", (3) een afspraakwoord, (4) anders: het eerste deel van de zin, zonder datumwoorden en beginwoorden. | Van specifiek naar algemeen: de eerste regel die past, wint. |
| 86–89 | `analyzeTranscript` begint: correctielijst toepassen en datum zoeken. | **Eerst** corrigeren, dan pas analyseren. Anders herkent de parser "Tant Arts" niet als tandarts. |
| 91–93 | Staat er een afspraakwoord in? | Nodig voor het type en voor AI-06. |
| 95–98 | Het type bepalen, in deze volgorde: idee → afspraak (tijd of afspraakwoord) → to-do → persoonlijk. | De volgorde is een **bewuste keuze**. "Ik moet om 2 uur naar de tandarts" bevat "moet" (to-do), maar is een afspraak. Daarom gaat afspraak vóór to-do. |
| 100–101 | `needsReview`: controleren bij een conflict, een vage datum, of een afspraak zonder tijd. | AI-06. |
| 103–110 | Het resultaat. De samenvatting komt uit `cleanTranscript`. | Alles samen in één kaartje. |
| 113–126 | `splitTranscript`: knipt bij "én daarna", "ook nog", "verder". | AI-05: voorstel om meerdere kaartjes te maken. De knop daarvoor komt in fase 4. De gebruiker beslist altijd zelf. |

### De tests (*.test.ts)

**Bestanden:** [lib/parser/dutch-date.test.ts](../lib/parser/dutch-date.test.ts) en [lib/classify/classify.test.ts](../lib/classify/classify.test.ts).

**Wat:** voorbeeldzinnen met het juiste antwoord. Draai `npm test` en de computer controleert ze allemaal (nu 69).

- **Vaste "vandaag":** de tests doen alsof het **woensdag 7 oktober 2026** is (`const TODAY`). Anders zou "morgen" elke dag een ander antwoord geven en zou een test morgen ineens falen.
- **`it.each([...])`:** een tabel met voorbeelden. Elke rij is één test. Wil je een voorbeeld toevoegen, dan voeg je één rij toe.
- **De iPhonezin uit fase 0** staat letterlijk in classify.test.ts, inclusief "smiddags" en "Tant Arts". Zo weten we zeker dat precies die fouten opgelost blijven.

**Let op (analytics translator):** tests zijn de **afspraken** tussen wat het bedrijf wil en wat de code doet. "Om 2 uur = 14:00" is een keuze; doordat die in een test staat, is hij zichtbaar en controleerbaar.

---

## 4. Spraak → tekst (Whisper)

### lib/audio/recorder.ts

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 1–4 | Whisper verwacht 16.000 getallen per seconde (16 kHz). | Dat is het formaat waarop Whisper getraind is. |
| 8–26 | `startRecording`: vraagt de microfoon (alleen de eerste keer om toestemming, SEC-15) en neemt op. `stop` zet de microfoon ook echt uit. | Zonder `track.stop()` blijft het microfoonlampje van de iPhone branden. |
| 28–44 | `toWhisperAudio`: zet de opname om naar 16 kHz mono. | Te vergelijken met **data cleaning**: ruwe data eerst in het juiste formaat zetten voordat het model ermee werkt. |

### workers/whisper.worker.ts

**Wat:** draait Whisper in een **Web Worker** (VOICE-05), zodat het scherm soepel blijft.

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 13–18 | Modellen alleen van onze eigen site laden (`allowRemoteModels = false`) en bewaren in de browseropslag. | SEC-03: nooit iets van Hugging Face ophalen tijdens gebruik. Opslaan zodat het model maar één keer gedownload hoeft te worden. |
| 19–21 | Onze eigen poortwachter (`split-fetch`) gebruiken voor alle downloads. | Zie hieronder. |
| 22–26 | De rekenbestanden (ONNX Runtime) van onze eigen site laden. | Standaard haalt de bibliotheek ze van een externe server (jsDelivr). Dat verbiedt SEC-02. |
| 30–43 | `load`: model laden met compressie "q8". | q8 = gecomprimeerd tot 8 bits. Kleiner, maar iets minder nauwkeurig. |
| 45–56 | Bij het bericht "load": eerst WebGPU proberen, anders terugvallen op WebAssembly. | Niet elk toestel heeft WebGPU. |
| 57–68 | Bij het bericht "transcribe": tekst maken met de taal vast op Nederlands. | Taal vastzetten is sneller en voorkomt dat Whisper denkt dat je Engels praat. |

### lib/whisper/messages.ts

**Wat:** de "berichtenlijst" tussen het scherm en de worker. Zo weten beide kanten precies welke berichten er bestaan (`load`, `transcribe`, `progress`, `ready`, `result`, `warning`, `error`).

### lib/whisper/split-fetch.ts

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 1–4 | Uitleg: twee taken. | |
| 17–20 | Het overzicht van opgeknipte bestanden (`split-manifest.json`) ophalen. | Daarin staat welke bestanden uit delen bestaan. |
| 22–34 | `assemble`: de delen (`.part0`, `.part1`) ophalen en aan elkaar plakken. | GitHub staat geen bestanden groter dan 100 MB toe; het whisper-small-bestand is 157 MB. |
| 36–40 | **Privacy-bewaker:** weigert elk verzoek naar een ander domein. | SEC-01. Een extra slot op de deur, naast de CSP. |
| 42–61 | Is het bestand opgeknipt? Dan de aan elkaar geplakte versie teruggeven (en onthouden). | De AI-bibliotheek merkt niet dat het bestand opgeknipt was. |
| 63 | Anders gewoon downloaden (van de eigen site). | |

---

## 5. Het scherm

### app/layout.tsx

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 4–13 | Titel van de pagina en instellingen voor het iPhonescherm (`viewportFit: "cover"`). | Zodat de app het hele scherm gebruikt, ook rond de notch (STY-10). |
| 15–32 | De **CSP**: de lijst regels voor de browser. `connect-src 'self'` = alleen verbinding met onze eigen site. | SEC-02. Zelfs als er per ongeluk foute code in de app zit, blokkeert de browser verbindingen naar buiten. |
| 34–43 | De basis-HTML van elke pagina, taal Nederlands. | |

### app/globals.css

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 3–13 | Achtergrond- en tekstkleur: crème (licht) of donkergrijs `#111214` (donker). | STY-07 en STY-08. |
| 15–22 | De vier typekleuren als namen (`appointment`, `todo`, `idea`, `personal`). | §5 van de requirements. Met namen kun je in de code `bg-appointment` schrijven in plaats van een kleurcode. |
| 24–31 | Systeemlettertype (SF Pro op iPhone) en ruimte voor de notch. | STY-04 en SEC-14: geen externe lettertypen. |

### app/page.tsx

Toont de testpagina van fase 0. Wordt in fase 1, stap 4 vervangen door de echte agenda.

### components/FeasibilityTest.tsx

**Wat:** de testpagina van fase 0 (model kiezen, opnemen, resultaten met tijden). **Wordt vervangen** in fase 1, stap 4. De opname- en Whisper-onderdelen worden dan hergebruikt.

| Regels | Wat gebeurt er |
|---|---|
| 19–39 | Geheugen van de pagina (gekozen model, status, resultaten). WebGPU-detectie in regels 26–31. |
| 41–68 | De worker starten en luisteren naar zijn berichten. |
| 70–79 | Opnametimer, met automatisch stoppen na 180 seconden (VOICE-02). |
| 84–121 | Model laden, opname starten en stoppen. |
| 123–224 | Wat je op het scherm ziet. AI-tekst wordt altijd als platte tekst getoond (SEC-16). |

---

## 6. Bouwen en publiceren

### scripts/fetch-models.mjs

**Wat:** downloadt de Whisper-modellen **op de laptop of op GitHub** (nooit op je telefoon) en knipt bestanden boven 90 MB op.

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 1–9 | Uitleg. | |
| 27–36 | Downloaden naar een tijdelijk bestand en daarna pas hernoemen. | Stopt een download halverwege, dan ziet het script de volgende keer geen half bestand voor een compleet bestand aan. |
| 38–53 | Opknippen in delen van 90 MB. | Onder de GitHub-limiet van 100 MB. |
| 56–77 | Voor elk model en elk bestand: overslaan als het er al is, anders downloaden en zo nodig opknippen. | Zo kun je het script veilig vaker draaien. |

### scripts/copy-ort.mjs

Kopieert twee rekenbestanden van de AI-bibliotheek naar `public/ort`, zodat ze van onze eigen site komen (SEC-02). Draait automatisch vóór `npm run dev` en `npm run build`.

### config/models.json

Eén plek met de modellen (whisper-base en whisper-small), de bestanden per model en de maximale bestandsgrootte (90 MB).

### .github/workflows/deploy.yml

**Wat:** de "lopende band" van GitHub. Bij elke `git push` naar `main`:

| Regels | Stap | Waarom |
|---|---|---|
| 18–19 | Anonieme statistieken van Next.js uit. | Past bij de privacybelofte. |
| 25–32 | Code ophalen, Node.js installeren, `npm ci`. | `npm ci` installeert **exact** de versies uit `package-lock.json` (SEC-17). |
| 34–35 | `npm audit`: beveiligingscontrole. | SEC-17. Bij een ernstig lek stopt de publicatie. |
| 37–38 | `npm test`: alle tests draaien. | Faalt er één test, dan gaat er niets online. Zo komt een kapotte datumherkenning nooit op je telefoon. |
| 40–46 | Modellen klaarzetten (onthouden tussen runs). | Scheelt elke keer 330 MB downloaden. |
| 48–52 | Bouwen en de map `out` klaarzetten. | |
| 54–62 | Publiceren op GitHub Pages. | |

### next.config.ts

| Regels | Wat gebeurt er | Waarom |
|---|---|---|
| 3–5 | `basePath = "/spraak-agenda"`. | De site staat op `…github.io/spraak-agenda`, dus alle adressen hebben dit voorvoegsel. |
| 8–9 | `output: "export"`: alleen losse bestanden, geen server. | Harde regel 2 in CLAUDE.md. |
| 14–15 | Het voorvoegsel beschikbaar maken voor de code. | Nodig om `/spraak-agenda/models/…` op te bouwen. |

---

## 7. Instellingenbestanden

| Bestand | Wat |
|---|---|
| `package.json` | Lijst van gebruikte pakketten en commando's (`npm run dev`, `npm test`, `npm run models`). |
| `package-lock.json` | De **exacte** versie van elk pakket (SEC-17). Niet met de hand aanpassen. |
| `tsconfig.json` | Instellingen voor TypeScript (JavaScript met typecontrole). |
| `eslint.config.mjs` | Regels voor codekwaliteit. Gegenereerde mappen (`public/ort`, `public/models`) worden overgeslagen. |
| `vitest.config.mts` | Instellingen voor de tests: waar ze staan en wat `@/` betekent. |
| `.gitignore` | Wat Git **niet** opslaat: `node_modules`, bouwmappen, modellen en `.env`-bestanden. |
| `public/.nojekyll` | Leeg bestand dat GitHub Pages vertelt de bestanden niet te bewerken (anders verdwijnt de map `_next`). |
| `AGENTS.md` | Automatisch aangemaakt door Next.js: een notitie voor AI-assistenten dat deze Next.js-versie nieuw is. |
| `CLAUDE.md` | Vaste werkafspraken voor Claude Code. |
| `requirements.md` | De volledige specificatie. Bij twijfel leidend. |
