# 3. Designsystem

Retning: *fintech møter produktivitetsapp* – inspirert av Revolut, Monzo, Copilot Money og Linear. Rolig flate, lekne detaljer, tydelig hierarki. Skal ikke minne om regneark.

## 3.1 Farger (tokens i `src/app/globals.css`)

| Rolle | Lys | Bruk |
|---|---|---|
| Bakgrunn | `#F7F5F2` varm off-white | Sidebakgrunn |
| Flate | `#FFFFFF` | Kort, med subtil skygge |
| Tekst | `#1D1A2B` / dempet `#6B6880` / svak `#8B889C` | Aldri seriefarge som tekstfarge i diagrammer |
| **Primær** | Dyp lilla `#5B3FD1` (skala 50–900) | Knapper, aktiv navigasjon, fokus |
| Positiv | Myk grønn `#2F9E6B` på `#E6F6EE` | Inntekt, innenfor budsjett |
| Advarsel | Varm oransje `#E8921A` på `#FFF3DF` | Nær grensen, trenger oppmerksomhet |
| Negativ | Dempet rød `#C9524F` på `#FBEBEA` | Utgifter/overskredet |

Mørk modus: egne, valgte trinn (ikke automatisk invertering), samme tokens under `prefers-color-scheme: dark` og `[data-theme=dark]`.

### Diagramfarger (validert palett)

Kategorifarger og diagramserier bruker den validerte 8-slots paletten fra dataviz-metoden (blå, oransje, aqua, gul, magenta, grønn, fiolett, rød), tildelt **per kategori og fast** («farge følger entiteten, ikke rangeringen»). Donut/ranking viser maks 7 deler + «Andre» (nøytral grå). Inntekt vs. utgift bruker blå vs. oransje (ikke rød/grønn – sikrer CVD-lesbarhet); fortegn og ikoner bærer mening i tillegg til farge. Statusfarger (grønn/oransje/rød) brukes kun for budsjettstatus, alltid med ikon + tekst.

## 3.2 Typografi

* **Plus Jakarta Sans** (variabel) til overskrifter og store tall – vennlig og moderne.
* **Inter** (variabel) til brødtekst og UI.
* Tabellkolonner med tall bruker `tabular-nums`; store «helte»-tall bruker proporsjonale tall.
* Skala: 12 · 13 · 14 · 16 · 20 · 24 · 32 · 44 px. Linjehøyde 1.4–1.5 for tekst, 1.1 for store tall.

## 3.3 Form og bevegelse

* **Radius:** kort 20 px, knapper/inputs 12 px, chips full runding.
* **Skygge:** `0 1px 2px rgb(29 26 43 / .04), 0 8px 24px -12px rgb(29 26 43 / .10)` – aldri tung.
* **Avstand:** 4-px-basert, generøs luft (kort-padding 20–24 px, gap 16–24 px).
* **Bevegelse:** 150–250 ms ease-out. Tall teller opp ved første visning, fremdriftsstolper vokser inn, kort løftes svakt på hover, konfetti på fullførte sparemål/milepæler. Respekterer `prefers-reduced-motion`.

## 3.4 Navigasjon og layout

| Bredde | Layout |
|---|---|
| < 768 px (mobil) | Topplinje (logo, søk) + **fast bunnmeny**: Oversikt · Transaksjoner · **＋** (hurtighandlinger) · Budsjett · Mer (Kategorier, Sparemål, Rapporter, Innstillinger) |
| 768–1023 px (nettbrett) | Ikon-sidefelt (med tooltips) + innhold |
| ≥ 1024 px | Fullt sidefelt med etiketter, topplinje med globalt søk og hurtighandlinger |

Innholdsbredde maks 1200 px; kort i responsivt rutenett (1 → 2 → 3/4 kolonner).

## 3.5 Komponenter (`src/components/ui`)

Button (primary/secondary/ghost/danger/soft, størrelser), Card, Input/Select/Textarea, Label, Badge/Pill, Progress (meter med alvorlighetsgrad), Dialog (modal på desktop, bunnark på mobil), Tabs, Switch, Checkbox, EmptyState, Skeleton, AnimatedNumber, ConfidencePill, CategoryChip (ikon + farge + navn), Toaster (sonner).

## 3.6 Tilgjengelighet

* Kontrast ≥ 4.5:1 for tekst, ≥ 3:1 for UI og diagrammer; status uttrykkes aldri med farge alene.
* Alt er tastaturbetjent, synlig fokusring (`outline` 2 px primær), `aria-label` på ikonknapper, `role="progressbar"` på meter.
* Diagrammer har tabell-/listevisning (rangeringslisten ved siden av donuten) og tooltip på både hover og fokus.
* Touch-mål ≥ 44 px på mobil. `prefers-reduced-motion` og `forced-colors` respekteres.

## 3.7 Tone of voice

Vennlig, kort, konkret. «Du har 6 200 kr igjen av månedens budsjett.» – ikke «Budsjettavvik: +6 200». Ved lite data: «Foreløpig anslag» / «Vi trenger litt mer data for å si noe sikkert».
