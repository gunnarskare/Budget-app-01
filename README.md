# Pengeflyt – budsjettapp for norske husholdninger

Moderne, intelligent og brukervennlig budsjettapp: importer transaksjoner fra banken (CSV), få automatisk kategorisering som lærer av deg, følg budsjett og sparemål, og se hvor mye du har igjen ved månedsslutt.

> **Dette er et første utkast.** Alt under er implementert og kjørende (ikke en statisk prototype), men se [«Status og kjente begrensninger»](#status-og-kjente-begrensninger) før du bruker det med ekte økonomi.

## Innhold

- [Funksjoner](#funksjoner)
- [Kom i gang](#kom-i-gang)
- [Arkitektur](#arkitektur)
- [Automatisk kategorisering](#automatisk-kategorisering)
- [Sikkerhet og personvern](#sikkerhet-og-personvern)
- [Testing](#testing)
- [Status og kjente begrensninger](#status-og-kjente-begrensninger)
- [Plan og dokumentasjon](#plan-og-dokumentasjon)

## Funksjoner

| Område | Hva det gjør |
|---|---|
| **Oversikt** | Tilgjengelig beløp, inntekt/utgift/sparing, **forventet saldo ved månedsslutt**, smarte innsikter, donut (utgifter per kategori), inntekt mot utgift, akkumulert forbruk mot forrige måned, budsjettmålere |
| **CSV-import** | Dra-og-slipp. Gjenkjenner skilletegn, tegnsett (UTF-8/Windows-1252), overskriftsrad, kolonner, datoformat, desimaltegn, inn/ut-kolonner. Kolonnemapping ved ukjent format. Duplikatkontroll, forhåndsvisning, flervalg, importhistorikk og **angre** |
| **Kategorisering** | Brukerregler → tidligere godkjente valg → butikkregister → nøkkelord → AI (kun usikre). Konfidensnivå og «hvorfor» vises; lav sikkerhet sendes til godkjenning |
| **Transaksjoner** | Søk, filter (dato, beløp, kategori, konto, type), inline kategoriendring med **Angre**, flervalg, «Til godkjenning»-kø, interne overføringer, refusjoner |
| **Budsjett** | Måned og uke, per kategori, kopier forrige, **forslag fra siste 3–6 måneder**, arv fra forrige periode, planlagt inntekt, tempo-prognose |
| **Kategorier** | 12 hovedkategorier med underkategorier (norsk standard), egne kategorier, ikon/farge, budsjettgrense, regelstyring |
| **Sparemål** | Flere mål, estimert måldato, «på rett spor», feiring (konfetti) ved milepæler |
| **Rapporter** | Måned/år, trykk på kategori for transaksjonene bak tallet, største poster, gjentakende betalinger og abonnementer, sparing over tid |
| **Onboarding** | Velkommen → valuta → importer/manuelt/eksempeldata → første budsjett → ferdig |
| **Innstillinger** | Profil, valuta, kontoer, AI av/på, tema (lys/mørk), slett transaksjoner / eksempeldata / hele kontoen |

Responsivt: fast bunnmeny med hurtighandlinger på mobil, ikon-sidefelt på nettbrett, fullt sidefelt på desktop.

## Kom i gang

**Krav:** Node.js ≥ 20.9 og et Supabase-prosjekt (hostet eller lokalt via `supabase start`, som krever Docker).

```bash
npm install
cp .env.example .env.local        # fyll inn Supabase-URL og publishable key
```

### 1. Database

Kjør migrasjonene i `supabase/migrations/` mot Supabase-prosjektet ditt:

```bash
supabase link --project-ref <ref>
supabase db push
```

(Eller lim inn filene i rekkefølge i SQL-editoren.) Migrasjonene oppretter tabeller, indekser, triggere, **RLS-policyer** og RPC-funksjoner.

Auth: appen bruker e-post + passord. Med e-postbekreftelse påslått (standard hos Supabase) får nye brukere en lenke; sett *Site URL* og `…/auth/callback` som tillatt redirect-URL. For rask lokal testing kan du slå av «Confirm email».

### 2. Kjør appen

```bash
npm run dev          # http://localhost:3000
```

Registrer deg → gå gjennom oppstarten → velg **«Prøv med eksempeldata»** for å se appen med 7 måneder realistiske data (kan fjernes under Innstillinger).

### Miljøvariabler

| Variabel | Påkrevd | Beskrivelse |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ja | Prosjekt-URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ja | Publishable (eller eldre anon) key – trygg å eksponere, RLS beskytter dataene |
| `OPENAI_API_KEY` | nei | Slår på AI-steget i kategoriseringen. **Kun serverside.** Uten nøkkel fungerer alt annet |
| `OPENAI_MODEL` | nei | Standard `gpt-4.1-mini` |
| `NEXT_PUBLIC_SITE_URL` | nei | Brukes i e-postlenker (standard `http://localhost:3000`) |

Det finnes ingen `service_role`-nøkkel i appen. Kontosletting skjer via en `security definer`-funksjon som bare kan slette innlogget bruker.

### Skript

```bash
npm run dev         # utvikling
npm run build       # produksjonsbygg
npm run lint        # ESLint (strenge react-hooks-regler)
npm run typecheck   # tsc --noEmit
npm test            # Vitest (126 tester)
./supabase/tests/run-local.sh   # migrasjoner + RLS-tester mot lokal Postgres (ikke Docker)
```

## Arkitektur

```
Nettleser ── Next.js 16 (App Router, React 19, Tailwind v4, Recharts)
   │  CSV tolkes i nettleseren (PapaParse); kun normaliserte rader sendes
   ▼
Server Actions (zod-validering) ── proxy.ts (sesjon, ruter) ── OpenAI (valgfritt, anonymisert)
   ▼
Supabase: Postgres + Auth + Row Level Security
```

- `src/lib/**` er **rene funksjoner** uten I/O (CSV-motor, kategorisering, aggregering, prognose, innsikter, budsjett, sparemål) – dekket av enhetstester.
- `src/app/actions/**` er tynne Server Actions; `src/lib/data/**` henter data (paginert – PostgREST gir maks 1 000 rader per kall).
- Databasen: `profiles` (= «users»), `accounts`, `categories`, `subcategories`, `transactions`, `import_batches`, `budgets`, `budget_categories`, `savings_goals`, `goal_contributions`, `categorization_rules`, `recurring_transactions`, `financial_insights`. Sammensatte fremmednøkler `(id, user_id)` hindrer at en rad peker på en annen brukers data.
- Beregning: hver transaksjon klassifiseres til nøyaktig én «bøtte» (inntekt/utgift/sparing/overføring). **Positivt beløp i en utgiftskategori er en refusjon** og reduserer forbruket; **bekreftede interne overføringer telles ikke** som inntekt eller utgift.

Se [`docs/01-arkitektur-og-database.md`](docs/01-arkitektur-og-database.md) for detaljer.

## Automatisk kategorisering

Første treff vinner, og hvert steg gir en konfidens (0–1). `≥ 0,80` godkjennes automatisk (AI: `≥ 0,85`), ellers havner transaksjonen i **«Til godkjenning»**.

1. **Brukerdefinerte og lærte regler** (0,99)
2. **Tidligere godkjente valg** for samme butikk (0,90–0,96)
3. **Butikkregister** (~150 norske aktører: REMA 1000, Kiwi, Circle K, Netflix, Fjordkraft …) (0,70–0,97)
4. **Nøkkelord** (strøm, husleie, parkering, lønn …) (0,60–0,93)
5. **AI** (OpenAI, strukturert JSON med streng skjema) kun for det som fortsatt er usikkert

Endrer du «REMA 1000» fra Diverse til Dagligvarer, lagres valget som regel og brukes neste gang – og på like, ikke-godkjente transaksjoner. AI kan **kun** velge blant dine egne kategorier (kodeliste), maks konfidens 0,90, og kan aldri slå sammen transaksjoner eller bekrefte en overføring.

**Personvern ved AI:** det sendes bare renset tekst (tall ≥ 5 sifre, e-post, telefon og IBAN fjernet, maks 60 tegn), retning og grovt beløpsintervall. Aldri dato, konto, saldo eller brukerinfo. Vipps-/giro-/overføringsrader (ofte personnavn) sendes ikke i det hele tatt.

## Sikkerhet og personvern

- Ingen bankinnlogging/BankID – kun CSV brukeren selv eksporterer. Selve filen lagres ikke; kun normaliserte rader + rå rad per transaksjon.
- **RLS på alle tabeller**, `force row level security`, anon har ingen tilgang. Testet med to brukere i `supabase/tests/rls.sql`.
- Originaldata fra banken (beskrivelse, beløp, dato, rå rad) **kan ikke endres** – håndhevet av databasetrigger.
- Filvalidering (type, maks 5 MB, maks 5 000 rader, binærdeteksjon), zod-validering på serveren, lengdekutt på alle felt.
- Sikkerhetshoder (`frame-ancestors`, `nosniff`, HSTS …), åpen-redirect-vern, ingen logging av beskrivelser/beløp.
- Brukeren kan angre import, slette alle transaksjoner, fjerne eksempeldata og slette hele kontoen.

## Testing

| Hva | Hvordan | Omfang |
|---|---|---|
| Enhetstester | `npm test` | 126 tester: tall-/datotolking, bankformater (DNB, SpareBank 1, Nordea, Danske, generisk, uten overskrift, ISO-8859-1), duplikater, kategorisering (alle steg), AI-validering/personvern, overføringspar, klassifisering, refusjoner, prognose, budsjett, forslag, innsikter (inkl. «for lite data»), sparemål |
| Database | `supabase/tests/run-local.sh` | Migrasjoner + RLS-isolasjon (to brukere), uforanderlige originaldata, sammensatte FK-er, RPC-funksjoner, kontosletting |
| Lint/typer/bygg | `npm run lint && npm run typecheck && npm run build` | Rent |

## Status og kjente begrensninger

**Verifisert:** enhetstester, RLS-/databasetester mot Postgres 16, `lint`, `typecheck`, produksjonsbygg, og en full gjennomgang i ekte nettleser (Playwright, desktop og iPhone-størrelse) av registrering, onboarding, eksempeldata, CSV-import (DNB-fil i Windows-1252 med duplikater, ugyldig rad og refusjon), duplikatdeteksjon ved re-import, angre, alle sider og de viktigste interaksjonene.

**Ikke verifisert / vær oppmerksom:**

- **Nettleser-testene kjørte mot en lokal emulator av Supabase sin REST/Auth-API (bygget på lokal Postgres med samme migrasjoner og RLS), ikke mot et ekte Supabase-prosjekt.** Kjør gjerne en røyktest mot ditt eget prosjekt. E-postbekreftelse/glemt passord er skrevet, men ikke testet mot ekte e-postutsending.
- **OpenAI-steget er kun testet med mock** (forespørselsform, validering, personvern). Ikke kjørt mot ekte API.
- **Bankformatene bygger på kjente CSV-eksporter, ikke ekte filer fra alle banker.** DNB og SpareBank 1 er best dekket; Nordea, Sbanken, Handelsbanken og Danske Bank er «best effort». Gjenkjenning feiler aldri hardt – ukjent format gir kolonnemapping.
- Prognoser og innsikter er enkle, forklarbare heuristikker – ikke økonomisk rådgivning. De sier fra når datagrunnlaget er tynt, og enkelte innsikter vises ikke før det er ≥ 3 måneder data.
- AI brukes kun til kategorisering. Innsiktene er regelbaserte (bevisst, for etterprøvbare tall).
- Flervaluta er foreløpig kun visning: beløp summeres uten omregning.
- Ikke gjort ennå: eksport av egne data, passordbytte-side, ende-til-ende-tester i CI, full CSP, tilgjengelighetsrevisjon med skjermleser.

## Plan og dokumentasjon

- [`docs/01-arkitektur-og-database.md`](docs/01-arkitektur-og-database.md) – arkitektur, database, kategoriseringsrørledning, sikkerhet
- [`docs/02-brukerflyt.md`](docs/02-brukerflyt.md) – onboarding, import, daglig bruk, feilhåndtering
- [`docs/03-designsystem.md`](docs/03-designsystem.md) – farger (validert diagrampalett), typografi, bevegelse, tilgjengelighet

Utviklet i faser: 1 fundament · 2 CSV-import · 3 kategorisering · 4 budsjett · 5 analyse/sparemål/innsikter · 6 kvalitetssikring.
