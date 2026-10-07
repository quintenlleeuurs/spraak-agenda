# Requirements — Spraakgestuurde AI-Agenda

> **Versie 3.1 (officieel)** · Status: vastgesteld · Taal UI: Nederlands
> Platform: installeerbare webapp (PWA) voor iPhone, gebouwd op Windows
> Wijziging 3.1: doeltoestel vastgesteld (iPhone 15 Pro of nieuwer); terugkerende afspraken toegevoegd als verplicht onderdeel (§4.5, fase 6).
> Kernbelofte: **gratis, privé en volledig lokaal.** Geen server, geen account, geen externe AI-API. Er verlaat geen enkel gebruikersgegeven de iPhone.

---

## 0. Doel & uitgangspunten

Een agenda-app voor de iPhone waarin de gebruiker vrijuit inspreekt. AI die in de app zelf draait zet de spraak om in tekst, structureert deze (titel, datum/tijd, type, samenvatting) en plaatst het resultaat als "kaartje" in een dag- of weekoverzicht. De app voelt aan als een luxe design-app: strak, rustig en verfijnd.

**Kernprincipes**
1. **Privacy by design:** alle verwerking en opslag gebeurt op de iPhone. De app maakt geen verbinding met derden.
2. **Gratis:** geen abonnementen, geen betaalde API's, geen developer-account, geen Mac.
3. **Spraak eerst:** elke invoer is binnen één tik te starten.
4. **Nooit iets missen:** filters resetten bij opnieuw openen; herinneringen volgen vaste logica.
5. **AI assisteert, de gebruiker beslist:** alles wat AI bepaalt is handmatig te corrigeren.
6. **Alles mag erin:** gevoelige items (zoals "Tandartscontrole") worden gewoon opgeslagen, versleuteld en alleen op het toestel.

---

## 1. Tech stack

| Laag | Keuze | Toelichting |
|---|---|---|
| Framework | **Next.js (React), App Router, `output: 'export'`** | Volledig statische export: er is **geen server en er zijn geen API-routes**. |
| Styling | **Tailwind CSS** | Custom kleurtokens, `backdrop-blur`, dark/light via `class`-strategie. |
| PWA | Web App Manifest + Service Worker (bijv. Serwist) | Installeerbaar via "Zet op beginscherm", volledig offline bruikbaar. |
| Spraak-naar-tekst | **Whisper in de browser via `transformers.js`** (ONNX Runtime Web) | Draait op de iPhone zelf. WebGPU waar beschikbaar, anders WebAssembly. Standaardmodel: `whisper-small` (meertalig, gekwantiseerd); lichtere optie `whisper-base` voor oudere toestellen. Taal vast op Nederlands. |
| Datum/tijd-herkenning | **Eigen regelgebaseerde Nederlandse parser** (TypeScript) | Deterministisch en betrouwbaar; geen AI nodig voor datums. |
| Titel, type & samenvatting | **Laag 1:** regels + trefwoorden (altijd actief) · **Laag 2 (optioneel, "Slimme modus"):** klein taalmodel in de browser via **WebLLM** (WebGPU) | Slimme modus alleen als het toestel het aankan; anders automatisch laag 1. |
| Opslag | **IndexedDB** (via Dexie), **versleuteld met Web Crypto API** | Kaartjes en audio versleuteld met AES-GCM; sleutel afgeleid van de pincode van de gebruiker. |
| Animaties | Framer Motion | Spring-animaties, gedeelde overgangen dag/week. |
| Drag & Drop | `@dnd-kit` | Touch-ondersteuning met long-press. |
| Audio | `MediaRecorder` + Web Audio (`AudioContext`, `AnalyserNode`) | Opname, omzetten naar 16 kHz mono voor Whisper, volumevisualisatie. |
| Hosting | **GitHub Pages** (gratis) | Levert alleen de app-bestanden en de AI-modellen; ontvangt nooit gebruikersdata. |
| Ontwikkelomgeving | Windows-laptop (Node.js, VS Code) + iPhone voor testen | Geen Mac nodig. |

### 1.1 Bewust niet gekozen
Externe AI-API's (Groq, Anthropic, OpenAI e.d.), eigen backend of API-routes, cloudopslag, accounts, pushservers, analytics, crashrapportage van derden, externe lettertypen of CDN's. Reden: elk daarvan zou gegevens of metadata naar derden sturen.

### 1.2 Randvoorwaarden
| ID | Requirement |
|---|---|
| ENV-00 | **Doeltoestel:** iPhone 15 Pro of nieuwer (8 GB werkgeheugen). Hierop wordt standaard `whisper-small` gebruikt en is Slimme modus beschikbaar. Oudere toestellen worden ondersteund met `whisper-base` en laag 1, maar zijn geen testdoel. |
| ENV-01 | iPhone met een recente iOS-versie en Safari. De app wordt gebruikt **vanaf het beginscherm**, niet vanuit een los Safari-tabblad (eigen, persistente opslag). |
| ENV-02 | Bij eerste gebruik worden de AI-modellen eenmalig gedownload (enkele honderden MB). De app adviseert dit via wifi te doen en toont de voortgang. Daarna werkt alles offline. |
| ENV-03 | De app detecteert bij het opstarten wat het toestel aankan (WebGPU, geheugen) en kiest automatisch het passende Whisper-model en of Slimme modus beschikbaar is. |
| ENV-04 | De GitHub-repository mag openbaar zijn: de broncode bevat geen gebruikersdata, sleutels of geheimen. |

---

## 2. Privacy & beveiliging (leidend voor alle andere eisen)

| ID | Requirement |
|---|---|
| SEC-01 | **Nul uitgaand verkeer met gebruikersdata.** De app bevat geen code die audio, transcripties, samenvattingen of kaartjes verstuurt. |
| SEC-02 | **Strikte Content Security Policy:** `default-src 'self'`; `connect-src 'self'`; geen inline scripts van derden; geen externe domeinen. Hierdoor kan de app technisch geen verbinding maken met andere partijen, ook niet per ongeluk of via een kwaadaardige afhankelijkheid. |
| SEC-03 | **Modellen zelf gehost:** Whisper- en taalmodelbestanden worden vanaf hetzelfde domein als de app geserveerd (opgesplitst in delen waar bestandslimieten dat vereisen) en door de Service Worker lokaal gecachet. |
| SEC-04 | **Pincode & versleuteling:** bij eerste gebruik stelt de gebruiker een pincode van minimaal 6 cijfers in. Hieruit wordt met PBKDF2 (SHA-256, ≥ 600.000 iteraties, willekeurige salt) een AES-GCM-sleutel afgeleid. Alle kaartjes, transcripties, samenvattingen en audio worden versleuteld opgeslagen in IndexedDB. |
| SEC-05 | De sleutel bestaat **alleen in het werkgeheugen**, wordt nooit opgeslagen en verdwijnt bij vergrendelen of sluiten van de app. |
| SEC-06 | **Automatische vergrendeling** na inactiviteit of verblijf in de achtergrond (instelbaar: direct / 1 / 5 / 15 minuten; standaard 5). |
| SEC-07 | **Brute-force-bescherming:** na 5 foute pincodes een oplopende wachttijd. Optioneel (standaard uit): alles wissen na 10 foute pogingen. |
| SEC-08 | **Pincode vergeten = data onleesbaar.** Er bestaat geen herstelmogelijkheid of achterdeur; dit wordt bij het instellen duidelijk uitgelegd, met het advies een versleutelde back-up te maken. |
| SEC-09 | **Privacyscherm:** bij vergrendeling en bij verlaten van de app wordt de inhoud direct verborgen. |
| SEC-10 | **Versleutelde back-up:** export als één bestand, versleuteld met een zelfgekozen back-upwachtwoord. Import herstelt alles. Onversleutelde export is niet mogelijk. Na 30 dagen zonder back-up toont de app een vriendelijke herinnering. |
| SEC-11 | **Persistente opslag:** bij eerste gebruik vraagt de app `navigator.storage.persist()` aan, zodat iOS de gegevens niet opruimt. |
| SEC-12 | **Dataminimalisatie:** audio-opnames worden standaard na 90 dagen verwijderd (instelbaar: 30 / 90 / 365 dagen / nooit); transcriptie en samenvatting blijven bewaard. |
| SEC-13 | **Echt verwijderen:** bij verwijderen van een kaartje wordt ook de audio gewist zodra geen ander kaartje ernaar verwijst. "Alles wissen" in Instellingen verwijdert alle data onherroepelijk (dubbele bevestiging). |
| SEC-14 | Geen trackers, analytics, cookies, advertentie- of social-media-scripts. Alle lettertypen en iconen zitten in de app zelf. |
| SEC-15 | Microfoontoestemming wordt pas gevraagd bij de eerste opname, met uitleg dat de verwerking op de iPhone plaatsvindt. |
| SEC-16 | AI-uitvoer wordt altijd als platte tekst weergegeven (nooit als HTML), om misbruik via ingesproken tekst uit te sluiten. |
| SEC-17 | Afhankelijkheden worden vastgepind (lockfile) en gecontroleerd met `npm audit` vóór elke publicatie. |

---

## 3. Hoofdscherm & navigatie

### 3.1 Bovenbalk (header)
| ID | Requirement |
|---|---|
| NAV-01 | Linksboven een hamburgermenu-icoon (drie horizontale streepjes). Tikken opent het uitrolbare zijmenu. |
| NAV-02 | Midden/rechts een toggle **Dag / Week**. Eén tik wisselt tussen Dag-weergave (focus op vandaag) en Week-weergave (alle 7 dagen naast/onder elkaar). |
| NAV-03 | Filterknop (trechter-icoon) om categorieën aan/uit te vinken: Afspraken, To-do's, Ideeën, Persoonlijk. |
| NAV-04 | **Filter-reset:** de filterstatus leeft alleen in het werkgeheugen en wordt nooit opgeslagen. Bij elke nieuwe start, bij ontgrendelen en na > 30 minuten in de achtergrond staan alle categorieën weer aan. |
| NAV-05 | Een actief filter is zichtbaar (stipje op het trechter-icoon). |
| NAV-06 | Zoekbalk bovenin; zoekt op trefwoord (bijv. "tandarts", "project X") in **titel, samenvatting én originele transcriptie**. Zoeken gebeurt lokaal op de ontsleutelde gegevens in het werkgeheugen. |
| NAV-07 | Zoeken is hoofdletter- en accentongevoelig, toont live resultaten en markeert de gevonden term. |

### 3.2 Uitrolbaar zijmenu (hamburgermenu)
| ID | Requirement |
|---|---|
| MENU-01 | **Spraakmemo-archief:** lijst van alle opnames (datum, duur, gekoppelde titel), terug te luisteren zolang niet opgeschoond (SEC-12). |
| MENU-02 | **Inspreken voor agenda:** start dezelfde opnameflow als de zwevende microfoonknop. |
| MENU-03 | **Persoonlijk / Vergeten dingen:** sectie voor krabbels en gedachten zonder datum. Items zonder herkende datum komen hier standaard terecht. |
| MENU-04 | **Instellingen & Thema's:** herinneringen, stille uren, thema, achtergrond, pincode en vergrendeling, back-up, opschoontermijn audio, AI-instellingen (model, Slimme modus), opslaggebruik. |

### 3.3 Agendaweergave & interactie
| ID | Requirement |
|---|---|
| CAL-01 | Elke taak, afspraak, idee of notitie verschijnt als **kaartje** op de juiste dag, en in de Dag-weergave op het juiste tijdstip. |
| CAL-02 | **Drag & Drop:** long-press (± 300 ms) maakt een kaartje versleepbaar naar een andere dag of tijd. Loslaten slaat direct op en herberekent de herinneringen. |
| CAL-03 | Tijdens slepen scrollt de weergave automatisch mee bij de schermranden. |
| CAL-04 | **Floating Action Button:** rechtsonder (of onderaan in het midden) zweeft altijd een opvallende microfoonknop, op elk scherm. Eén tik start direct een opname. |

---

## 4. Spraakinvoer, lokale AI & detailscherm

### 4.1 Inspreekproces
| ID | Requirement |
|---|---|
| VOICE-01 | Tik op de microfoonknop → opname start direct. Nogmaals tikken stopt de opname. |
| VOICE-02 | Maximale opnameduur 3 minuten (instelbaar tot 5), om verwerkingstijd en geheugengebruik op de iPhone beperkt te houden. |
| VOICE-03 | Audio wordt direct na het stoppen versleuteld opgeslagen, pas daarna verwerkt. Gaat er iets mis tijdens verwerking, dan blijft de opname bewaard en kan de verwerking opnieuw worden gestart. |
| VOICE-04 | Werkt volledig offline (ook in vliegtuigmodus), nadat de modellen eenmaal zijn gedownload. |
| VOICE-05 | Verwerking gebeurt in een Web Worker, zodat de interface soepel blijft tijdens transcriptie. |

### 4.2 AI-pijplijn (volledig op de iPhone)

**audio → Whisper (transformers.js) → transcript → Nederlandse datumparser → titel/type/samenvatting (laag 1 of 2) → kaartje(s)**

| ID | Requirement |
|---|---|
| AI-01 | **Titelgeneratie:** korte, heldere titel (max. ± 40 tekens), bijv. "Tandartscontrole". Laag 1: kernwoorden uit het transcript met een woordenlijst (bijv. "tandarts" + "controle" → "Tandartscontrole"). Laag 2: gegenereerd door het taalmodel. |
| AI-02 | **Datum- & tijdherkenning** via de eigen Nederlandse parser, tijdzone `Europe/Amsterdam`. Ondersteunt minimaal: vandaag, morgen, overmorgen, over X dagen/weken, (volgende/deze) + weekdag, volgende week + weekdag, datums als "12 oktober" en "12-10", tijden als "om 2 uur", "om twee uur 's middags", "14:00", "half drie", "kwart over tien", en dagdelen ('s ochtends / 's middags / 's avonds). Getallen in woorden worden herkend. |
| AI-03 | **Type- & labeldetectie:** `afspraak` (tijdsgebonden, bevat een tijd of afspraakwoord zoals tandarts, vergadering, eten met), `todo` (werkwoorden als moet, kopen, regelen, bellen, halen), `idee` (idee, misschien, zou leuk zijn, later uitwerken), `persoonlijk` (overig). In Slimme modus bepaalt het taalmodel het type, met de regels als controle. |
| AI-04 | **Samenvatting & transcriptie:** het exacte Whisper-transcript wordt ongewijzigd bewaard. Laag 1: opgeschoonde versie van het transcript (hoofdletters, interpunctie, stopwoorden als "eh" verwijderd). Laag 2: een netjes geformuleerde samenvatting inclusief details (bijv. "neem verzekeringspasje mee"). |
| AI-05 | **Slimme context-herkenning:** bij verbindingswoorden als "en daarna", "én", "ook nog", "verder" splitst de app het transcript in delen en stelt voor om meerdere kaartjes te maken (bijv. één afspraak + één to-do). De gebruiker kiest **Splitsen** of **Als één kaartje houden**. Gesplitste kaartjes delen dezelfde audio. |
| AI-06 | Bij twijfel (geen tijd gevonden bij een afspraakwoord, of tegenstrijdige datums) krijgt het kaartje het label "Controleer datum". |
| AI-07 | **Slimme modus (optioneel):** schakelbaar in Instellingen, alleen beschikbaar als het toestel WebGPU en voldoende geheugen heeft. Gebruikt een klein meertalig taalmodel (1–3B parameters, gekwantiseerd) via WebLLM, met JSON-uitvoer volgens het schema in §4.3. Mislukt of duurt het te lang (> 20 s), dan valt de app automatisch terug op laag 1. |
| AI-08 | Datums worden **altijd** door de parser berekend, ook in Slimme modus: het taalmodel mag geen absolute datums bepalen. |
| AI-09 | **Transparantie:** alle automatisch gegenereerde velden zijn gemarkeerd met een klein ✦-icoon ("Automatisch gegenereerd"). In het datamodel wordt vastgelegd welke velden automatisch zijn gemaakt en met welke methode (regels of model). |

### 4.3 Uitvoerschema Slimme modus
```json
{
  "items": [
    {
      "title": "Tandartscontrole",
      "type": "afspraak",
      "datePhrase": "volgende week dinsdag om twee uur 's middags",
      "summary": "Controle bij de tandarts. Vergeet niet het verzekeringspasje mee te nemen.",
      "confidence": 0.9
    }
  ],
  "suggestSplit": false
}
```
`datePhrase` wordt door de parser (AI-02) omgezet naar een datum en tijd. Uitvoer wordt gevalideerd met `zod`; ongeldige uitvoer → terugval op laag 1.

### 4.4 Detailscherm (tik op kaartje)
| ID | Requirement |
|---|---|
| DET-01 | Tikken op een kaartje opent een pop-up/bottom sheet met alle details. |
| DET-02 | **Samenvatting** bovenaan, met ✦-markering. |
| DET-03 | Knop **"Exacte transcriptie"** naast/onder de samenvatting toont de letterlijke ingesproken tekst (uitklapbaar). |
| DET-04 | **Audiospeler:** play/pauze, voortgangsbalk en duur voor de originele opname. |
| DET-05 | **Afvinkvakje** voor to-do's en ideeën. Afgevinkt = doorgestreept; na 24 uur automatisch gearchiveerd (terug te vinden via zoeken). |
| DET-06 | **Handmatige correctie:** dropdown om het type te wijzigen (bijv. To-do → Afspraak). Kleur, label en herinneringen passen zich direct aan. |
| DET-07 | Titel, datum, tijd en samenvatting zijn handmatig aan te passen. |
| DET-08 | Rechtsonder staat het type uitgeschreven met kleur/icoon (bijv. "● Afspraak", "● To-do"). |
| DET-09 | Knop **"Zet in iPhone-agenda"** voor afspraken (zie REM-08). |
| DET-10 | Verwijderen met bevestiging en een "Ongedaan maken"-melding (5 seconden). |

### 4.5 Terugkerende afspraken en taken (verplicht, gepland in fase 6)

> Dit onderdeel moet **sowieso** gebouwd worden. Het staat bewust in een latere fase; Claude Code herinnert de opdrachtgever eraan (zie CLAUDE.md).

| ID | Requirement |
|---|---|
| REC-01 | Afspraken en to-do's kunnen terugkeren: dagelijks, wekelijks (op één of meer weekdagen), elke X weken, maandelijks (vaste datum of bijv. "elke eerste maandag"), jaarlijks. |
| REC-02 | **Spraakherkenning:** de datumparser herkent herhalingen als "elke dinsdag", "iedere week op maandag en donderdag", "om de week", "elke eerste maandag van de maand", "elke dag om 8 uur", "elk jaar op 3 mei". |
| REC-03 | **Einde van een reeks:** zonder einde (standaard), tot een datum ("tot de zomer" → vraagt om een datum, "tot 1 juli"), of na X keer. |
| REC-04 | In het detailscherm een herhaal-instelling (dropdown + weekdagkeuze) om een herhaling handmatig in te stellen, te wijzigen of te verwijderen. |
| REC-05 | Terugkerende kaartjes tonen een klein herhaal-icoon (↻) naast het typelabel. |
| REC-06 | **Wijzigen of verslepen** van een terugkerend kaartje vraagt: "Alleen deze" of "Deze en alle volgende". Verwijderen idem, plus "De hele reeks". |
| REC-07 | Afvinken van een terugkerende to-do vinkt alleen die ene keer af; de volgende keer verschijnt gewoon. De 1-week-herinnering (REM-01) geldt per keer. |
| REC-08 | Herinneringen (REM-03 t/m REM-05) gelden voor elke afzonderlijke keer. Bij "Zet in iPhone-agenda" wordt de herhaling als `RRULE` in het `.ics`-bestand meegegeven. |
| REC-09 | Herhalingen worden niet als losse kopieën opgeslagen maar als één regel (RRULE-stijl) met uitzonderingen; de app berekent de afzonderlijke keren voor de zichtbare periode. |

---

## 5. Visuele labeling & kleurcodes

| Type | Betekenis | Kleurnaam | Richtwaarde |
|---|---|---|---|
| Afspraak | Tijdsgebonden evenementen (tandarts, vergadering, eten met vrienden) | 🍷 Muted Ruby / Terracotta | `#C0604F` |
| To-do | Actiepunten en taken (boodschappen, administratie) | 🫐 Deep Slate / Soft Indigo | `#5B6BA8` |
| Idee | Losse ingevingen, concepten, later uitwerken | 🍯 Warm Amber / Warm Gold | `#D4A24C` |
| Persoonlijk / Overig | Vrije tijd, ontspanning, geheugensteuntjes | 🌿 Sage / Soft Emerald | `#7FA88A` |

| ID | Requirement |
|---|---|
| LBL-01 | Elk kaartje in het overzicht heeft **rechtsonder** een subtiel gekleurd streepje/label in de typekleur. |
| LBL-02 | In het detailscherm staat rechtsonder de uitgeschreven tekst met kleur/icoon, zodat direct duidelijk is waarom het kaartje die kleur heeft. |
| LBL-03 | Elk type heeft een eigen icoon; kleur is nooit de enige informatiedrager (toegankelijkheid). |
| LBL-04 | Exacte hexwaarden worden per thema (dark/light) getest op contrast. |

---

## 6. Herinneringen

Een webapp kan op de iPhone zonder server geen meldingen sturen terwijl de app gesloten is. De herinneringslogica wordt daarom op drie manieren uitgevoerd, allemaal lokaal.

### 6.1 Logica (bepaalt wanneer iets een herinnering is)
| ID | Requirement |
|---|---|
| REM-01 | **To-do's en ideeën:** een item dat na **1 week** nog niet is afgevinkt, wordt elke week opnieuw een herinnering zolang het openstaat. |
| REM-02 | Bij een to-do/idee-herinnering kan de gebruiker direct kiezen: **Verplaatsen naar volgende week**, **Nu afvinken** of **Verwijderen**. |
| REM-03 | **Afspraken (standaard):** 1e herinnering **1 dag van tevoren om 09:00**; 2e herinnering **1 uur voor aanvang**. |
| REM-04 | **Vroege ochtendafspraken:** valt de 1-uur-herinnering binnen de stille uren (standaard tot 07:00), dan wordt deze **15 minuten voor aanvang** gezet. Voorbeeld: afspraak 08:00 → herinnering 07:45 in plaats van 07:00. |
| REM-05 | **Stille uren:** instelbaar (standaard 22:00–07:00). Geen herinneringen binnen dit venster; ze schuiven naar het eerste toegestane moment (afspraken volgen REM-04). |

### 6.2 Uitvoering
| ID | Requirement |
|---|---|
| REM-06 | **Bij openen van de app:** bovenaan verschijnt een overzicht "Herinneringen" met alles wat sinds het laatste bezoek aan de beurt was, inclusief de knoppen uit REM-02. |
| REM-07 | **Terwijl de app open is:** op het juiste moment verschijnt een melding binnen de app (glazen banner met zachte animatie). |
| REM-08 | **Echte iPhone-meldingen voor afspraken (opt-in per afspraak):** knop "Zet in iPhone-agenda" maakt lokaal een `.ics`-bestand met de afspraak en twee alarmen volgens REM-03/REM-04. iOS opent dit in de Agenda-app, die daarna zelf meldingen geeft, ook als de agenda-app gesloten is. |
| REM-09 | Bij REM-08 toont de app eenmalig uitleg: de afspraak staat dan ook in de iPhone-agenda, en als die agenda met iCloud synchroniseert, gaat de afspraak ook naar iCloud. De gebruiker kiest zelf per afspraak. Standaard wordt alleen de titel en tijd meegegeven, geen samenvatting of transcriptie. |
| REM-10 | Na verslepen of wijzigen van een afspraak die al in de iPhone-agenda staat, toont de app de melding: "Deze afspraak staat ook in je iPhone-agenda. Wil je die bijwerken?" met een nieuwe `.ics`. |
| REM-11 | Het app-icoon op het beginscherm toont via de Badging API (waar ondersteund) het aantal openstaande herinneringen. |

---

## 7. Design, vormgeving & thema's

### 7.1 Achtergrond & leesbaarheid
| ID | Requirement |
|---|---|
| DES-01 | Op maat gemaakte, rustgevende achtergrond voor dag- en weekagenda, ontworpen via Claude Design-prompts en als bestand in de app opgenomen (variant voor dark en light). Er gaat daarbij geen gebruikersdata naar Claude Design; het betreft alleen het ontwerp. |
| DES-02 | In zowel Dark als Light Mode minimaal WCAG AA-contrast (4.5:1) voor tekst en labels over de achtergrond heen. |

### 7.2 Visuele stijl: Modern Chique
| ID | Requirement |
|---|---|
| STY-01 | **Glassmorphism:** kaartjes en menu's met transparante, vervaagde achtergrond (`backdrop-blur-xl`, `bg-white/5` à `bg-white/10`), waardoor de achtergrond zachtjes doorschijnt. |
| STY-02 | **Verfijnd palet:** de pastel-/aardetinten uit §5; geen harde basiskleuren. |
| STY-03 | **Subtiele randen & glows:** dunne, zachte rand (`border-white/10`) met een zachte ambient glow in de typekleur in plaats van zware zwarte schaduwen. |
| STY-04 | **Typografie:** systeemfont (`-apple-system`, dus SF Pro op de iPhone), met Inter als meegeleverde fallback. Hiërarchie via letterdikte: ultralight/light headers, medium titels, regular bodytekst. |
| STY-05 | **Afgeronde hoeken:** `border-radius` van 16px tot 24px op kaartjes, sheets en knoppen. |
| STY-06 | **Ademruimte:** ruime marges en padding; de agenda oogt nooit vol. In weekweergave worden bij veel items de overige samengevat ("+3 meer"). |
| STY-07 | **Dark Mode:** OLED-zwart `#000000` of midnight graphite `#111214`, waardoor de kaartkleuren oplichten. |
| STY-08 | **Light Mode:** warm off-white/crème (bijv. `#F7F4EE`), nooit hard spierwit. |
| STY-09 | Thema volgt standaard de systeeminstelling, handmatig te overschrijven. |
| STY-10 | Layout respecteert de veilige zones van de iPhone (notch/Dynamic Island, home-indicator) via `env(safe-area-inset-*)`. |

---

## 8. Micro-interacties & "wow"-details

| ID | Requirement |
|---|---|
| MIC-01 | **Vloeiende animaties (60/120 fps):** zachte overgang tussen Dag- en Weekweergave; alleen `transform` en `opacity` animeren. |
| MIC-02 | **Spring-animatie:** kaartjes zweven met een veer-effect naar hun plek bij verslepen en sorteren. |
| MIC-03 | **Voelbare feedback:** Safari op de iPhone ondersteunt de Vibration API niet. De app gebruikt daarom een visuele micro-bounce bij start/stop van de opname en een bevredigende "klik"-animatie bij afvinken. Waar iOS haptiek geeft bij native schakelaars (`<input type="checkbox" switch>`), wordt dat benut voor het afvinkvakje (experimenteel, te testen op het toestel). |
| MIC-04 | **Zwevende microfoonknop** met glassmorphism-effect in rust. |
| MIC-05 | **Glow & pulse:** tijdens het spreken pulseert een zachte kleurengloed rond de knop die reageert op het stemvolume (`AnalyserNode`), met een geluidsgolf-visualisatie. |
| MIC-06 | Respecteert `prefers-reduced-motion`: dan alleen fades, geen veer- of pulse-effecten. |

---

## 9. Snelheid & robuustheid

| ID | Requirement |
|---|---|
| TEC-01 | **Optimistic UI:** na het stoppen van een opname verschijnt direct een placeholder-kaartje; afvinken, verslepen en wijzigen zijn direct zichtbaar. |
| TEC-02 | **Shimmer loading:** strakke, subtiele glim-animatie over het placeholder-kaartje tijdens verwerking, met een indicatie van de voortgang ("Luisteren…", "Ordenen…"). |
| TEC-03 | Slimme context-herkenning: zie AI-05. |
| TEC-04 | App-shell laadt in < 1,5 s bij herhaald gebruik (gecachet door de Service Worker). |
| TEC-05 | Het Whisper-model wordt vooraf geladen zodra de gebruiker de app ontgrendelt, zodat een opname snel verwerkt kan worden. |
| TEC-06 | Richtwaarde verwerkingstijd: een memo van 15 seconden is binnen ± 10 seconden verwerkt op een recente iPhone (te valideren in de testfase). |
| TEC-07 | Alles werkt offline. |
| TEC-08 | Opslaggebruik (kaartjes, audio, modellen) zichtbaar in Instellingen, met de optie om modellen te verwijderen en later opnieuw te downloaden. |

---

## 10. Datamodel (IndexedDB, versleuteld)

Alle records worden opgeslagen als `{ id, iv, ciphertext }`. Alleen het `id` en een versleutelde index zijn onversleuteld; alle inhoud zit in `ciphertext` (AES-GCM).

**Ontsleutelde vorm `Item`**
```ts
type ItemType = "afspraak" | "todo" | "idee" | "persoonlijk";

interface Item {
  id: string;                 // uuid
  title: string;
  type: ItemType;
  date: string | null;        // "YYYY-MM-DD"; null = Persoonlijk / Vergeten dingen
  time: string | null;        // "HH:mm"
  durationMinutes?: number;
  summary: string;
  transcript: string;         // exacte Whisper-tekst
  audioId: string | null;
  completed: boolean;
  completedAt?: string;
  archived: boolean;
  status: "processing" | "ready" | "needsReview" | "error";
  confidence?: number;
  typeSetManually: boolean;
  generatedFields: string[];  // bijv. ["title", "summary", "type"]
  generatedBy: "rules" | "model";
  inPhoneCalendar: boolean;   // REM-08
  recurrence: string | null;  // REC-09: RRULE, bijv. "FREQ=WEEKLY;BYDAY=TU"; veld vanaf fase 1 aanwezig, functionaliteit in fase 6
  exceptions?: { date: string; action: "skip" | "moved" | "done"; movedTo?: string }[];
  lastReminderAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

**Ontsleutelde vorm `Audio`**: `{ id, blob, mimeType, durationSec, createdAt, itemIds[] }`

**Onversleutelde instellingen (LocalStorage)** — bevatten geen persoonlijke inhoud: thema, stille uren, vergrendeltijd, opschoontermijn, gekozen model, Slimme modus aan/uit, datum laatste back-up, salt voor de sleutelafleiding.

**Nergens opgeslagen:** de pincode, de sleutel en de filterstatus (NAV-04, SEC-05).

---

## 11. Wet- en regelgeving

**AVG**
- Voor eigen gebruik valt de app onder de uitzondering voor persoonlijke/huishoudelijke activiteiten.
- Ook als anderen de app gebruiken, verwerkt de maker geen persoonsgegevens: er wordt niets verzameld, verstuurd of centraal opgeslagen. Gevoelige gegevens (zoals medische afspraken) en gegevens van derden (namen in memo's) blijven versleuteld op het toestel van de gebruiker.
- Bij openbaar aanbieden: een korte privacyverklaring in de app die uitlegt dat alle verwerking lokaal gebeurt, dat de hostingdienst alleen de app-bestanden levert, en wat er gebeurt bij "Zet in iPhone-agenda" (REM-09).
- Rechten van gebruikers zijn lokaal geborgd: inzien (de app zelf), meenemen (versleutelde back-up), wissen (SEC-13).

**AI Act**
- Geen verboden praktijk en geen hoog-risicotoepassing.
- Transparantie: automatisch gegenereerde inhoud wordt altijd gemarkeerd (AI-09).
- Menselijke controle: alles is handmatig te corrigeren (DET-06, DET-07).

---

## 12. Faseplanning

| Fase | Inhoud | Doel |
|---|---|---|
| **0. Haalbaarheidstest** | Minimale pagina: opnemen → Whisper in de browser → tekst tonen, getest op de eigen iPhone. | Bepalen welk model werkt en hoe snel/nauwkeurig het Nederlands wordt herkend. |
| **1. Kern** | Next.js-project, PWA-installatie, opslag, kaartjes, Dag/Week, datumparser, titel/type/samenvatting (laag 1), detailscherm, kleurcodes, zoeken, filter met reset. | Bruikbare agenda. |
| **2. Beveiliging** | Pincode, versleuteling, automatische vergrendeling, privacyscherm, CSP, versleutelde back-up, opschonen, "Alles wissen". | Privacybelofte waarmaken. |
| **3. Herinneringen** | Herinneringsoverzicht bij openen, in-app meldingen, `.ics`-export met alarmen, stille uren, vroege-ochtendregel. | Nooit iets missen. |
| **4. Beleving** | Glassmorphism, Claude Design-achtergrond, spring-animaties, drag & drop, pulse-microfoon, shimmer, splitsvoorstel. | Wow-gevoel. |
| **5. Slimme modus** | WebLLM-integratie, testen op de iPhone 15 Pro, automatische terugval. | Betere titels en samenvattingen. |
| **6. Terugkerende afspraken (verplicht)** | REC-01 t/m REC-09: herkenning in de parser, herhaal-instelling, ↻-icoon, "alleen deze / alle volgende", herinneringen per keer, RRULE in `.ics`. | Vaste afspraken één keer inspreken. |

---

## 13. Acceptatiecriteria

**Functioneel**
- *"Ik moet volgende week dinsdag om twee uur 's middags naar de tandarts voor een controle, vergeet niet mijn verzekeringspasje mee te nemen"* → één kaartje "Tandartscontrole" (Afspraak, terracotta) op de juiste dinsdag om 14:00, met het verzekeringspasje in de samenvatting — **ook in vliegtuigmodus**.
- *"Tandarts om 2 uur én daarna even boodschappen halen"* → splitsvoorstel: één afspraak + één to-do.
- Filter op "alleen To-do's", app afsluiten en heropenen → alle categorieën staan weer aan.
- Zoeken op een woord dat alleen in de transcriptie staat, vindt het juiste kaartje.
- Een afspraak om 08:00 via "Zet in iPhone-agenda" → alarmen op de dag ervoor om 09:00 en om 07:45.
- *"Elke dinsdag om zeven uur 's avonds sporten"* → terugkerend kaartje (↻) op alle komende dinsdagen om 19:00; verslepen van één dinsdag vraagt "Alleen deze" of "Deze en alle volgende" (fase 6).
- Een to-do die 7 dagen openstaat → verschijnt bij openen in het herinneringsoverzicht met Verplaatsen / Afvinken / Verwijderen.

**Privacy & beveiliging**
- Netwerkcontrole (Web Inspector van Safari of een proxy op de laptop) toont tijdens opnemen, verwerken, zoeken, opslaan en herinneren **nul verzoeken naar andere domeinen** en nul verzoeken met gebruikersdata.
- De IndexedDB-inhoud, bekeken via Web Inspector, bestaat alleen uit versleutelde gegevens; geen enkele titel of transcriptie is leesbaar.
- Zonder pincode is geen enkel kaartje zichtbaar; na de ingestelde tijd in de achtergrond vraagt de app opnieuw om de pincode.
- Een versleutelde back-up kan op een leeggemaakte app volledig worden teruggezet met het juiste wachtwoord, en niet zonder.

**Design**
- Alle teksten en labels halen WCAG AA-contrast in dark en light mode.
- Animaties lopen vloeiend op de eigen iPhone; met "Verminder beweging" aan zijn alleen fades zichtbaar.

---

## 14. Bekende beperkingen (bewust geaccepteerd)

| Beperking | Gevolg | Maatregel |
|---|---|---|
| Geen meldingen als de app gesloten is | Herinneringen voor to-do's/ideeën zie je pas bij openen | Herinneringsoverzicht (REM-06); afspraken via iPhone-agenda (REM-08) |
| Geen trilfunctie in Safari | Geen haptiek bij opnemen/afvinken | Visuele feedback, experimentele switch-haptiek (MIC-03) |
| AI in de browser is kleiner dan cloud-AI | Transcriptie en samenvattingen minder nauwkeurig | Exacte transcriptie + handmatige correctie; datums via betrouwbare parser |
| Eenmalige modeldownload van enkele honderden MB | Eerste gebruik vergt wifi en opslagruimte | Voortgangsscherm, lichter model voor oudere toestellen |
| Data staat alleen op de telefoon | Bij verlies of wissen is alles weg zonder back-up | Versleutelde back-up met maandelijkse herinnering (SEC-10) |
| Pincode vergeten | Data is niet te herstellen | Duidelijke waarschuwing bij instellen; back-up heeft een eigen wachtwoord |
