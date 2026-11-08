# 2. Brukerflyt

Mål: en person uten økonomisk kompetanse skal forstå sin situasjon på under ett minutt, og være i gang på under fem.

## 2.1 Første gangs bruk (onboarding, ≤ 5 min)

```
Registrer ─► 1 Velkommen ─► 2 Valuta ─► 3 Hvordan vil du starte?
                                          ├─ Importer CSV ─► 4 Last opp ─► 5 Sjekk kategorier ─┐
                                          ├─ Legg inn manuelt ─────────────────────────────────┤
                                          └─ Prøv med eksempeldata ────────────────────────────┤
                                                                                                ▼
                                                              6 Første budsjett (forslag fra dataene dine) ─► 7 Ferdig → Oversikt
```

* Hvert steg har ett tydelig valg og en «Hopp over»-vei – ingen steg krever skjema med mer enn ett–to felt.
* Steg 4–5 gjenbruker samme importveiviser som resten av appen.
* Steg 6: «Foreslå budsjett» fra siste 3–6 måneder; uten nok data tilbys fornuftige startverdier som brukeren justerer.
* Eksempeldata kan fjernes med ett klikk i Innstillinger.

## 2.2 CSV-import (kjernen)

| Steg | Hva brukeren ser | Hva appen gjør |
|---|---|---|
| 1 Last opp | Dra-og-slipp / velg fil, velg konto (eller opprett), liste over støttede banker, forklaring på filtyper | Validerer type og størrelse |
| 2 Kontroller | «Gjenkjent: DNB». Forhåndsvisning av de første radene. Kolonnemapping kan åpnes/endres. Feil og hoppede rader listes med radnummer | Detekterer tegnsett, skilletegn, overskrift, datoformat, desimaltegn, kolonner |
| 3 Kategoriser | Tabell med forslag, konfidens og *hvorfor*. Filtre: «Trenger oppmerksomhet», «Duplikater», «Alle». Marker flere rader og sett kategori samtidig. «Godkjenn alle forslag» | Regler → historikk → butikk → nøkkelord → AI. Dupliserte rader markeres og avhukes |
| 4 Ferdig | Oppsummering (importert / hoppet over / duplikater), lenker til Oversikt og «Til godkjenning». **Angre**-knapp | Lagrer, finner overføringer og gjentakende betalinger, oppdaterer innsikter |

Kantsaker som håndteres: `;`/`,`/tab-skilletegn, ISO-8859-1, BOM, metadata-linjer før overskrift, inn/ut-kolonner i stedet for ett beløpsfelt, `1.234,56` og `1,234.56`, minus-tegn av ulike slag, `dd.mm.yyyy`/`yyyy-mm-dd`/`dd/mm/yy`, tomme rader, reserverte (ikke bokførte) rader, tomme felt.

## 2.3 Daglig bruk

* **Oversikt:** status → innsikter → diagrammer → budsjettindikatorer. Alt klikkbart: kategori → filtrerte transaksjoner.
* **Transaksjoner:** global søk, filtre (dato, beløp, kategori, konto, status), endre kategori direkte i listen, flervalg, «Til godkjenning»-kø.
* **Når brukeren endrer en kategori:** valget huskes (som regel) og tilsvarende transaksjoner kan oppdateres i samme grep. Toast med **Angre**.
* **Budsjett:** velg måned/uke → sett beløp per kategori → se brukt/gjenstår/overskredet. «Kopier forrige» og «Foreslå» finnes.
* **Sparemål:** opprett → «Legg til penger» (feiring ved milepæler) → estimert måldato.
* **Rapporter:** måned/år, trykk på en kategori for å se transaksjonene bak tallet.

## 2.4 Destruktive handlinger

Alle destruktive handlinger krever bekreftelsesdialog med konkret konsekvens («Dette sletter 142 transaksjoner»). Der det er hensiktsmessig tilbys **Angre** (kategoriendringer, import). Kontosletting krever at brukeren skriver «slett».

## 2.5 Tomtilstander

Hver side har en tomtilstand som forklarer *hva som mangler* og gir én primærhandling: Oversikt («Importer en bankfil eller prøv eksempeldata»), Transaksjoner, Budsjett («Foreslå budsjett»), Sparemål, Rapporter.

## 2.6 Feilhåndtering

* Import: feil per rad (radnummer + årsak) – gyldige rader kan fortsatt importeres. Ukjent format → kolonnemapping.
* Nettverks-/serverfeil: toast med forståelig tekst, tilstand beholdes slik at brukeren kan prøve igjen.
* AI utilgjengelig/feil/timeout: importen fortsetter; usikre rader havner i «Til godkjenning».
