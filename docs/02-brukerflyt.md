# 2. Brukerflyt

Mål: en person uten økonomisk kompetanse skal forstå sin situasjon på under ett minutt, og være i gang på under fem.

## 2.1 Første gangs bruk (onboarding, ≤ 5 min)

```
Registrer ─► 1 Velkommen ─► 2 Valuta ─► 3 Hvordan vil du starte?
                                          ├─ Importer CSV ─► 4 Last opp ─► 5 Sjekk kategorier ─┐
                                          ├─ Legg inn manuelt ─────────────────────────────────┤
                                          ├─ Prøv med eksempeldata ────────────────────────────┤
                                          │                                                     ▼
                                          │                   6 Første budsjett (forslag fra dataene dine) ─► 7 Ferdig → Oversikt
                                          └─ Bygg budsjettet først (ingen bankfil) ─► Budsjettbygger (se 2.7)
```

* Hvert steg har ett tydelig valg og en «Hopp over»-vei – ingen steg krever skjema med mer enn ett–to felt.
* Steg 4–5 gjenbruker samme importveiviser som resten av appen.
* Steg 6: «Foreslå budsjett» fra siste 3–6 måneder. Uten nok data tilbys i stedet **budsjettbyggeren** (bygg fra bunnen), og med data tilbys den også som alternativ («Bygg fra bunnen i stedet»).
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
* **Budsjett:** «Slik er pengene fordelt» (inntekt → utgifter → sparing → til overs, med behov/ønsker/sparing) → velg måned/uke → se brukt/gjenstår/overskredet per kategori, og hva hvert kategoribeløp er bygget opp av. Justeringer for én måned går fint. «Bygg budsjettet»/«Juster planen» er hovedhandlingen; «Kopier forrige» og «Foreslå ut fra historikk» finnes som snarveier.
* **Sparemål:** opprett → «Legg til penger» (feiring ved milepæler) → estimert måldato.
* **Rapporter:** måned/år, trykk på en kategori for å se transaksjonene bak tallet.

## 2.7 Budsjettbyggeren (`/budsjett/bygg`)

Mål: man skal kunne **planlegge fremover** – fra inntekt og faste utgifter til sparing – uten en eneste transaksjon. Historikk er en valgfri pekepinn, aldri forutsetningen.

```
1 Inntekt ─► 2 Faste utgifter ─► 3 Variable utgifter ─► 4 Sparing ─► 5 Oppsummering ─► Lagre (gjelder fra denne/neste måned)
        ▲ løpende status øverst: Inntekt · Utgifter · Sparing · Til overs
```

| Steg | Innhold |
|---|---|
| 1 Inntekt | Lønn etter skatt, stønader, ekstrainntekt, utleie – med frekvens. Tips om at lønn varierer gjennom året (juni/desember). |
| 2 Faste utgifter | Sjekkliste per kategori (husleie/lån, strøm, internett, kommunale avgifter, forsikringer, abonnementer, barnehage, lån …) uten ferdige beløp. Frekvens per post (uke/måned/kvartal/år) regnes om til måned, så «bilforsikring per år» blir riktig. Egne poster kan legges til. Fant appen faste betalinger i transaksjonene, tilbys de som snarvei. |
| 3 Variable utgifter | En ramme per kategori (mat, drivstoff, restaurant, shopping, fritid …). Mat kan legges inn «per uke». Finnes historikk, vises «du bruker vanligvis ca. X» med knapp – fratrukket det som allerede er planlagt som fast. |
| 4 Sparing | «Betal deg selv først»: hurtigvalg 10/15/20 % av inntekten, egne sparingsposter og sparemål med månedlig bidrag og klartekst på hva det betyr for måldatoen («Med 2 000 kr/mnd når du målet rundt juli 2028»). |
| 5 Oppsummering | Tall, fordelingsstolpe (behov/ønsker/sparing/til overs) mot 50/30/20, sjekk av planen («Penger uten jobb» → «Sett av til sparing», «Planen går i minus», sparerate, høye faste utgifter), valgfri realitetssjekk mot historikk, og hva som havner i budsjettet. |

Prinsipper:
* **Ingen oppdiktede tall.** Forslagsradene har ingen ferdige beløp; alle beløp kommer fra brukeren eller fra brukerens egne data. Rådene er tommelfingerregler med forbehold, ikke fasit.
* **Planen er kilden, budsjettet er et øyeblikksbilde.** Lagring skriver til valgt måned; senere måneder arver; tidligere måneder røres ikke.
* **Fungerer både uten og med data:** et eksisterende manuelt budsjett brukes som utgangspunkt hvis det ikke finnes noen plan (samlebeløp for bolig/abonnementer vises under faste utgifter, så de kan deles opp).
* Ulagrede endringer gir advarsel ved forlatelse; feil i felt (ugyldig beløp, post uten navn/kategori) markeres og tar brukeren til riktig steg.

## 2.4 Destruktive handlinger

Alle destruktive handlinger krever bekreftelsesdialog med konkret konsekvens («Dette sletter 142 transaksjoner»). Der det er hensiktsmessig tilbys **Angre** (kategoriendringer, import). Kontosletting krever at brukeren skriver «slett».

## 2.5 Tomtilstander

Hver side har en tomtilstand som forklarer *hva som mangler* og gir én primærhandling: Oversikt («Bygg et budsjett», «Importer en bankfil» eller «Prøv eksempeldata»), Transaksjoner, Budsjett («Bygg budsjettet» – forklarer at ingen transaksjoner trengs), Sparemål, Rapporter.

## 2.6 Feilhåndtering

* Import: feil per rad (radnummer + årsak) – gyldige rader kan fortsatt importeres. Ukjent format → kolonnemapping.
* Nettverks-/serverfeil: toast med forståelig tekst, tilstand beholdes slik at brukeren kan prøve igjen.
* AI utilgjengelig/feil/timeout: importen fortsetter; usikre rader havner i «Til godkjenning».
