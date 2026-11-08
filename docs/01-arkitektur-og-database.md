# 1. Arkitektur og database

> Plan skrevet **før** implementasjon. Der implementasjonen avviker fra planen, er det notert under «Avvik og bevisste valg» nederst.

## 1.1 Overblikk

```
┌─────────────────────────── Nettleser ───────────────────────────┐
│ Next.js (React 19, App Router) · Tailwind v4 · Recharts          │
│  • CSV leses og tolkes LOKALT i nettleseren (PapaParse)          │
│  • Kun normaliserte rader sendes til serveren                    │
└───────────────▲───────────────────────────────┬─────────────────┘
                │ RSC / Server Actions          │ cookies (sesjon)
┌───────────────┴───────────────────────────────▼─────────────────┐
│ Next.js-server (Node)                                            │
│  • proxy.ts: fornyer Supabase-sesjon, beskytter ruter            │
│  • Server Actions: validerer med zod, kjører importmotor,        │
│    kategorisering, prognoser                                     │
│  • OPENAI_API_KEY finnes kun her                                 │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ supabase-js (brukerens JWT)   │ fetch (kun anonymisert tekst)
┌───────────────▼─────────────┐        ┌────────▼─────────┐
│ Supabase: Postgres + Auth   │        │ OpenAI (valgfri) │
│  • Row Level Security       │        └──────────────────┘
│  • RPC: angre import, slett │
└─────────────────────────────┘
```

### Teknologivalg

| Lag | Valg | Begrunnelse |
|---|---|---|
| Rammeverk | Next.js 16 (App Router), React 19, TypeScript | Server Components gir rask førstevisning; Server Actions gir trygg skriving uten eget API-lag |
| Stil | Tailwind CSS v4 + shadcn-stil komponenter (Radix) | Designtokens i CSS, tilgjengelige primitiver |
| Diagrammer | Recharts | Rask å bygge interaktive diagrammer; fargene følger `docs/03-designsystem.md` |
| Backend | Supabase (Postgres, Auth) | RLS gir isolasjon per bruker i selve databasen |
| CSV | PapaParse + egen importmotor | Robust parsing; egen normalisering for norske tall/datoer |
| AI | OpenAI Chat Completions med strukturert JSON | Kun for usikre transaksjoner, aldri først |
| Test | Vitest | Importmotor, kategorisering og beregninger er rene funksjoner og testes isolert |

### Prinsipper

1. **Rene funksjoner i `src/lib/**`.** All forretningslogikk (parsing, normalisering, kategorisering, aggregering, prognose, innsikter) er fri for I/O og dekket av enhetstester. Server Actions og sider er tynne lim.
2. **Database er sannhetskilden for tilgang.** Appen *tror* ikke at den filtrerer på `user_id` – RLS håndhever det uansett.
3. **Originaldata er uforanderlig.** Bankens beskrivelse, beløp, dato og rå CSV-rad lagres og kan ikke endres (databasetrigger).
4. **AI foreslår, bruker bestemmer.** AI-forslag får aldri høyere status enn «trenger godkjenning» med mindre konfidensen er høy, og AI kan bare velge blant brukerens egne kategorier.

## 1.2 Databasemodell

Alle tabeller har `user_id uuid not null default auth.uid()` og RLS-policyer `user_id = (select auth.uid())`.
Fremmednøkler til andre brukerdata er **sammensatte** `(id, user_id)`, slik at en rad aldri kan peke på en annen brukers rad.

```
auth.users ──1:1── profiles
     │
     ├── accounts ───────────────┐
     │      │                    │
     │      └── transactions ◄───┼── import_batches
     │            │   │          │
     │            │   └── (category_id, subcategory_id)
     ├── categories ── subcategories
     │      │
     │      ├── budget_categories ── budgets
     │      └── categorization_rules
     ├── savings_goals ── goal_contributions
     ├── recurring_transactions
     └── financial_insights
```

| Tabell | Hensikt | Viktige kolonner |
|---|---|---|
| `profiles` | «users»-tabellen i speccen. 1:1 med `auth.users` (opprettes av trigger ved registrering) | `display_name`, `currency`, `ai_enabled`, `onboarded_at` |
| `accounts` | Bankkontoer | `kind` (checking/savings/credit/investment/cash), `account_number_last4`, `opening_balance`, `is_demo` |
| `categories` | Hovedkategorier | `system_key` (stabil nøkkel for innebygde), `name`, `icon`, `color`, `kind` (expense/income) |
| `subcategories` | Underkategorier | `category_id`, `system_key`, `is_saving` (sparing/investering regnes som sparing, ikke forbruk) |
| `transactions` | Transaksjoner | `original_description` (uforanderlig), `description` (visningsnavn), `merchant_key`, `amount` (negativ = utgift), `category_source`, `confidence`, `review_status` (auto/review/user), `transfer_status` (none/suggested/confirmed), `fingerprint` + `occurrence`, `raw` (original CSV-rad), `source` (import/manual/demo) |
| `import_batches` | Importhistorikk | `filename`, `bank_profile`, `column_mapping`, tellere, `status` (imported/undone) |
| `budgets` | Budsjett for en periode | `period_type` (month/week), `period_start`, `planned_income` |
| `budget_categories` | Planlagt beløp per kategori | `budget_id`, `category_id`, `amount` |
| `savings_goals` | Sparemål | `target_amount`, `current_amount`, `target_date`, `monthly_contribution` |
| `goal_contributions` | Innskudd på sparemål | `amount`, `contributed_on` |
| `categorization_rules` | Brukerregler og lærte regler | `pattern`, `match_type`, `direction`, `category_id`, `source` (user/learned), `mark_transfer`, `hit_count` |
| `recurring_transactions` | Oppdagede gjentakende betalinger | `merchant_key`, `typical_amount`, `frequency`, `next_expected`, `is_subscription`, `status` |
| `financial_insights` | Genererte innsikter | `insight_key` (stabil → dismissals overlever), `kind`, `severity`, `title`, `body`, `data`, `dismissed_at` |

### Duplikatkontroll

`fingerprint = sha256(account_id | dato | beløp | normalisert beskrivelse)`. To identiske kjøp samme dag er lovlige, så hver rad får også `occurrence` (1, 2, 3 … innen fila). Unik indeks: `(user_id, account_id, fingerprint, occurrence)`.
* Eksakt treff → hoppes over («Allerede importert»).
* Samme dato + beløp + konto, men *annen* beskrivelse → «mulig duplikat»: **merkes, men slås aldri sammen automatisk**.

### Beregninger – hvordan en transaksjon klassifiseres

Hver transaksjon havner i nøyaktig én «bøtte» (`src/lib/finance/classify.ts`):

| Bøtte | Regel |
|---|---|
| `transfer` | `transfer_status = 'confirmed'` på brukskonto → telles verken som inntekt eller utgift |
| `saving` | Underkategori med `is_saving`, eller bekreftet overføring *inn på* sparekonto/investeringskonto |
| `income` | Kategori av typen `income` (eller ukategorisert positivt beløp) |
| `expense` | Alt annet. **Positivt beløp i en utgiftskategori er en refusjon/tilbakebetaling og reduserer forbruket i kategorien** |

### Prognose

`forventet saldo ved månedsslutt = (inntekt − utgifter − sparing hittil)
  + forventet gjenstående inntekt   (gjentakende, ikke mottatt ennå – f.eks. lønn)
  − forventede faste utgifter       (gjentakende, ikke trukket ennå)
  − forventet variabelt forbruk     (det du vanligvis bruker i månedens gjenstående dager)`

Variabelt forbruk bygger på dine egne siste hele måneder (maks 3): gjennomsnittet av utgiftene som falt på de *gjenstående dagene*, justert (dempet, 0,7–1,4×) for om du ligger over/under vanlig tempo så langt. Faste utgifter (gjentakende) holdes utenfor, så de ikke telles to ganger. Store poster tidlig i måneden (husleie) ekstrapoleres dermed aldri utover måneden. Uten historikk brukes lineært tempo og prognosen merkes «foreløpig». Sikkerhet: *høy* ≥ 3 måneders historikk og ≥ 7 dager inn i måneden, *middels* ≥ 1 måned, ellers *lav*.

«Tilgjengelig nå» = inntekt hittil + kjent forventet inntekt − utgifter − sparing, slik at tallet ikke er dypt negativt før lønningsdag.

## 1.3 Kategoriseringsrørledning

Rekkefølge – første treff vinner, og hvert steg gir en `confidence` (0–1):

| # | Steg | Kilde (`category_source`) | Konfidens |
|---|---|---|---|
| 1 | Brukerdefinerte og lærte regler (`categorization_rules`) | `rule` | 0.99 |
| 2 | Tidligere godkjente kategoriseringer for samme `merchant_key` | `history` | 0.90–0.96 |
| 3 | Butikk-/leverandørregister (≈150 norske aktører) | `merchant` | 0.85–0.95 |
| 4 | Nøkkelord (strøm, husleie, parkering, lønn …) | `keyword` | 0.60–0.80 |
| 5 | AI (OpenAI, strukturert JSON) kun for rader under 0.80 | `ai` | maks 0.90 |
| – | Ingen treff | `default` → Diverse › Ukategorisert | 0 |

* `confidence ≥ 0.80` → `review_status = 'auto'`; ellers `'review'` (havner i «Til godkjenning»).
* Når brukeren endrer en kategori, lagres valget som lært regel (valgfritt) og brukes på like transaksjoner.
* **Interne overføringer:** nøkkelord (`overføring egen konto` …) → `confirmed`; to motsatte, like store beløp på ulike egne kontoer innen 2 dager → `suggested` (spør brukeren).

### Personvern ved AI-kall

Sendes: renset beskrivelse (tall ≥ 4 sifre, e-post, telefonnummer og kontonumre fjernet, maks 60 tegn), retning (inn/ut) og et grovt beløpsintervall. Sendes **ikke**: dato, kontonummer, saldo, brukerinfo. Vipps-/giro-/overføringsrader (ofte personnavn) sendes ikke. AI kan kun svare med en kode fra listen over brukerens kategorier; ugyldige svar forkastes.

## 1.4 Sikkerhet

* **Autentisering:** Supabase Auth (e-post + passord), sesjon i httpOnly-cookies via `@supabase/ssr`. `proxy.ts` kaller `auth.getUser()` (verifiserer mot Auth-serveren).
* **RLS** på alle tabeller; verifisert med to testbrukere (se `supabase/tests/rls.sql`).
* **Ingen bankinnlogging.** Appen ber aldri om BankID/passord – kun CSV som brukeren selv eksporterer.
* **Filvalidering:** maks 5 MB og 5 000 rader, kun `.csv/.txt/.tsv`, tekst dekodes defensivt (UTF-8 → Windows-1252), verdier valideres og kuttes i lengde både i nettleser og på server (zod).
* **Hemmeligheter:** `OPENAI_API_KEY` kun på serveren. Ingen `service_role`-nøkkel i appen; kontosletting skjer via `security definer`-funksjon som kun kan slette innlogget bruker.
* **Logging:** servercoden logger aldri beskrivelser, beløp eller rader – kun feilkoder.
* **Sletting:** angre import, slette alle transaksjoner, fjerne eksempeldata, slette konto (cascade).
* **Sikkerhetshoder** i `next.config.ts`: `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy`. (En full, nonce-basert CSP er ikke satt opp i første utkast.)

## 1.5 Mappestruktur

```
supabase/migrations/      SQL: skjema, RLS, funksjoner
supabase/tests/           SQL-tester (RLS-isolasjon)
docs/                     Plan (denne mappen)
src/app/                  Ruter (Server Components + Server Actions)
src/components/ui/        Designsystem-primitiver
src/components/…          Funksjonskomponenter (import, dashboard, budsjett …)
src/lib/csv/              Parsing, kolonnegjenkjenning, normalisering, duplikatkontroll
src/lib/categorize/       Kategorimodell, butikkregister, nøkkelord, motor, AI
src/lib/finance/          Klassifisering, aggregering, prognose, budsjett, innsikter
src/lib/supabase/         Klienter (browser/server/proxy)
```

## 1.6 Avvik og bevisste valg

* **`users` → `profiles`.** Selve brukerne ligger i `auth.users`; `profiles` er den offentlige delen.
* **Ingen lagring av CSV-filer (Supabase Storage brukes ikke).** Filen tolkes i nettleseren, og kun normaliserte rader + rå rad per transaksjon lagres. Mindre sensitiv data på lur, og originalbeskrivelsen er likevel bevart.
* **AI brukes kun til kategorisering.** Innsiktene (anbefalingene) genereres av en regelbasert motor fra brukerens egne tall, med krav til datagrunnlag per innsikt – det gir etterprøvbare tall og ingen risiko for oppdiktede fakta. AI-formulerte sammendrag er et naturlig neste steg.
* **Aggregering i TypeScript, ikke SQL-views.** Gjør beregningene testbare og uavhengige av databasen. Data hentes med paginering (PostgREST begrenser til 1 000 rader per kall).
* **Budsjettgrense per kategori** ligger i `budget_categories` for aktuell periode (ikke som egen kolonne på kategorien) slik at historikk bevares. Måneder uten eget budsjett arver forrige budsjett.
