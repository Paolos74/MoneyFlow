# CONTESTO di MoneyFlow (per le chat future)

PWA statica personale per un'utente italiana non sviluppatrice: spese, entrate, stipendio, conti in euro e crypto, calendario, pagamenti programmati, budget, obiettivi, statistiche, backup/CSV, sync Firebase facoltativa.
Metodo e stack: `PWA-BASE.md` (vincolante). Decisioni dell'utente: `MONEYFLOW-DECISIONI.md` (D1–D24, A–I), `MONEYFLOW-V2-DECISIONI.md` (v2), `MONEYFLOW-V4-DECISIONI.md` (v4), `MONEYFLOW-V5-DECISIONI.md` (v5) e `MONEYFLOW-V6-DECISIONI.md` (v6, vince in caso di conflitto); qui c'è solo ciò che serve per lavorare sul codice.

- Versione: `moneyflow-v6` (`VERSION` in `sw.js`), branch `moneyflow-v6`: con i budget Quanto ti resta toglie anche i programmati da pagare (barre per categoria comprese), crypto nel patrimonio con il valore scritto a mano. Dalla v5: Quanto ti resta sul budget complessivo con colore progressivo, Quanto metti da parte, sezione Investimenti (ETF) con tasse stimate. Dalla v4: 5 schede (Home, Movimenti, Budget, Statistiche, Conti), periodo dallo stipendio, quanto ti resta / puoi spendere oggi, spesa divisa tra più persone, import CSV, conto deposito con interessi automatici, netto letto dal PDF a modulo, icone di conti e categorie; design (Parte B) ispirato a Buddy.
- v5: commit `5367ec2641a43513238d97e021695d035f5fc776` (base della v6). Lo zip della v6 = `git diff --name-only 5367ec2 HEAD` (senza `.agents/`, `.worktrees/`, `docs/`); file da cancellare = `git diff --name-status 5367ec2 HEAD | grep ^D`.
- v4 pubblicata: commit `856eba0c7e433fc47acda24f1b68f8c61f56556e` (base della v5). Lo zip della v5 = `git diff --name-only 856eba0 HEAD` (senza `.agents/`, `.worktrees/`, `docs/`); file da cancellare = `git diff --name-status 856eba0 HEAD | grep ^D`.
- v3 pubblicata: commit `a730f75b6285e499cdaff33dbc379c428ae2df1c` (base della v4). Lo zip della v4 = `git diff --name-only a730f75 HEAD` (senza `.agents/`, `.worktrees/`, `docs/`); file da cancellare su GitHub = `git diff --name-status a730f75 HEAD | grep ^D`. Per il rilascio successivo usare lo sha di `main` dopo il merge `--ff-only` della v4.
- Nessun riferimento al lavoro dell'utente nei file (controllato da `tests/static.test.js`).

## Comandi
- Test: `node --test tests/*.test.js`
- Sintassi: `for f in $(git ls-files -co --exclude-standard '*.js'); do node --check "$f" || exit 1; done`
- Icone: `python3 tools/make_icons.py` → `icons/moneyflow-v4.svg`, `icons/moneyflow-v4-favicon.svg` e `icons/moneyflow-v4-{192,512,maskable-512,apple-touch-180,favicon-32}.png` (stessa geometria, banconote) (nomi con la versione, così i telefoni non riusano l'icona vecchia; a ogni nuovo disegno cambiare il nome, aggiornare manifest, `index.html`, `offline.html`, ASSETS e `tests/static.test.js`)
- PDF sintetici della busta paga (dati inventati) per i test: `python3 tools/make_payslip_pdf.py` → `tests/fixtures/busta-paga-sintetica.pdf`, `busta-paga-sintetica-cid.pdf` e (v4) `busta-paga-sintetica-modulo.pdf` (etichette in un Form XObject, "NETTO A PAGARE" a lettere spaziate)
- Browser: dalla cartella sopra `python3 -m http.server 8765` → `http://localhost:8765/moneyflow/`

## File principali
`js/money.js` (centesimi, quantità 1e-8, `tradeEuroCents`, percentuali in punti base), `js/dates.js` (date locali, periodi D8), `js/recurrence.js`, `js/store.js` (modello, validazione, tombstone), `js/calc.js` (aggregati puri), `js/csv.js`, `js/backup.js`, `js/sync.js` (+ `js/firebase-config.js`), `js/prefs.js`, `js/theme-boot.js`, `js/ui.js`, `js/charts.js`, `js/icons.js`, `js/app.js` (router, SW, banner), `js/views/*.js` (una vista per schermata; `parts.js` pezzi condivisi; `movimento-form.js` tutti i fogli di inserimento, compresi Compra/Vendi e il modulo busta paga).
Nuovi in v2: `js/tax-tables.js` (scaglioni e detrazioni per anno, solo dati: per un anno nuovo aggiungere una voce), `js/tax.js` (stima IRPEF, conguaglio, addizionali), `js/tax-settings.js` (impostazioni della stima), `js/pension.js` (simulatore fondo pensione), `js/pdf-text.js` (lettore PDF minimo: FlateDecode con `DecompressionStream`, object stream, ToUnicode), `js/payslip.js` (voci della busta: I01, I21, 900, 60450, riga Ferie, NETTO A PAGARE, mese/anno), `js/views/metti-da-parte.js`, `js/views/fondo-pensione.js`.

Nuovi in v4: `js/period.js` (periodo di budget, `remaining`), `js/interest.js` (formula degli interessi documentata, `accrueInterest`, `reconcileInterest`), `js/csv-import.js` (lettura CSV, Revolut, generico, doppioni, `suggestCategory`), `js/routes.js` (router puro), `js/views/budget.js`, `js/views/importa.js`. `calendario.js` esporta `renderCalendar` (vista di Movimenti). Fixture `tests/fixtures/data-v2.json` e `data-v3.json` (generate con lo store pubblicato) e `estratto-revolut-prova.csv`.

Nuovi in v5: `js/invest.js` (formule degli ETF documentate: costo medio ponderato, plusvalenze, tasse, zainetto, valore a una data), `js/views/investimento.js` (pagina dell'ETF). In `js/money.js` prezzi a 4 decimali (`parsePrice4Input`, `formatPrice4`, `etfTradeCents`, `proportionalCents`, `avgPrice4`, `taxCents`, `formatPercentSigned`, `formatRateBp`); in `js/period.js` `remaining` con `mode` 'budget'|'cashflow', `progressStop`, `savedInPeriod`; in `js/calc.js` `budgetAdvice` e `netWorth` con `investCents`/`totalCents`. Fogli ETF in `movimento-form.js` (`openEtfTradeForm`, `openDividendForm`, `openEtfPriceSheet`), foglio Nuovo/Modifica ETF e card Tasse in `conti.js`. Fixture `tests/fixtures/data-v4.json` generata con lo store v4 pubblicato.

Nuovi in v6 (nessun file nuovo): `js/period.js` `remaining` modo budget = budget − uscite − programmati da pagare (`planned`, `used`); `js/calc.js` `budgetStatus(state, range, today)` con `planned`/`used` per categoria, `cryptoUnitValue`, `cryptoValue`, `netWorth` con `cryptoCents`, `cryptoValued`, `cryptoUnvalued` (e `netWorthSeries` con `investCents`/`cryptoCents`); `js/store.js` `setAccountPrice`; foglio `openCryptoPriceSheet` in `movimento-form.js`. Fixture `tests/fixtures/data-v5.json` e `investments-v5.json` generate con lo store v5 pubblicato.

## Design v5 (colori)
Token `--prog-0…3` (verde, giallo ocra, arancio, rosso; chiaro `#047857 #846100 #AD4800 #C5221F`, scuro `#34D399 #FACC15 #FB923C #FF6B5E`) miscelati con `color-mix(in srgb)` dentro `@supports` (tappe 0/50/85/100 %); `--ring-track` grigio neutro. Contrasto controllato a ogni 1 % in `tests/contrast.test.js`. Specifica: `.agents/tasks/moneyflow-v5/design-spec.md` (non pubblicata).

## Design v3 (colori)
Smeraldo = colore principale (azioni, +, scheda attiva, Patrimonio, Conti, Da ricevere, entrate); grigi neutri iOS (`--bg #F2F2F7`/`#000000`). Colori complementari in `css/app.css`, ognuno con testo, pieno (`-fill`, testo bianco) e tenue opaco (`-soft`): laguna `--teal` (mese, periodo, grafici per mese, linea del patrimonio), indaco `--indigo` (stipendio e tasse, fondo pensione), viola `--violet` (programmati, da confermare), ambra `--amber` (budget, uscite per categoria, Compra/Vendi), magenta `--pink` (obiettivi, Metti da parte). `card({ tint, icon, color })` mette la tinta e il riquadro col glifo nell'intestazione; `section({ cls: 'section--t-<tinta>' })` colora l'intestazione. Verde/rosso dei valori e colori di conti e categorie invariati. Contrasti WCAG calcolati nella specifica `/projects/sandbox/.agents/tasks/moneyflow-v3/SPEC.md` (fuori dal repository).

## Chiavi localStorage
- `moneyflow:data` — `{ app:'MoneyFlow', schemaVersion:1, accounts, categories, movements, scheduled, goals }`
- `moneyflow:investments` (v5) — `{ app:'MoneyFlow', schemaVersion:1, investments }`: chiave separata, così una scheda in v4 non cancella gli ETF; sincronizzata come tipo `investment` e inclusa nel backup (`investments`). Se manca e `moneyflow:data` contiene `investments` (backup v5 importato in una v4) si usano quelli. Illeggibile → copia in `moneyflow:investments:corrupt-<ms>`.
- `moneyflow:prefs` — tema, formato CSV, `lastBackupAt`, `firstUseAt`, `lastPeriod`, `beforeImportKey` (solo dispositivo, non sincronizzate)
- `moneyflow:tax` — impostazioni della stima delle tasse (v2): `{ hireDate, regionalBp, municipalBp, years: { 'AAAA': { projTaxable, projIrpef } } }` (solo dispositivo: non sincronizzate e non nel backup)
- `moneyflow:sync` — apiKey, projectId, email, uid, token, cursore, `dirty`, ultimo esito (mai la password)
- `moneyflow:data:corrupt-<ms>` — copia grezza di dati illeggibili; `moneyflow:data:before-import-<ms>` — copia prima di un'importazione

## Modello dati (schemaVersion 1; v2 e v4 aggiungono solo campi facoltativi)
Ogni record: `id`, `createdAt`, `updatedAt` (ms), `deleted`. Importi interi: centesimi per l'euro, unità 1e-8 per le crypto.
- account: `name` (unico), `kind` 'eur'|'crypto', `asset` (crypto), `initial`, `color`, `order`
- category: `name` (unico per tipo), `type` 'uscita'|'entrata', `color`, `budget` (uscite), `role` ('stipendio'), `order`
- movement: `type` uscita|entrata|trasferimento|restituzione|variazione, `date`, `amount` (variazione con segno), `accountId`, `toAccountId`, `amountTo` (solo se unità diverse), `categoryId`, `description`, `note`, `excluded` (uscita), `refundOf` (restituzione → uscita), `gross` (entrata: Competenze lorde, era il "Lordo" della v1), `scheduledId`, `occurrence`; v2: `trade` 'compra'|'vendi'|null e `price` (centesimi per 1 unità intera) sui trasferimenti euro↔crypto (Compra: euro → crypto, `amount` euro, `amountTo` quantità; Vendi: il contrario), `payslip` `{ contributions, taxable, irpef, pension, deductions }` (centesimi o null; null se tutto vuoto) sulle entrate
- scheduled: `type` uscita|entrata|trasferimento, `amount`, conti, `categoryId`, `description`, `start`, `freq` once|weekly|monthly|months|yearly, `interval`, `end`, `handled` `{data: 'confermato'|'saltato'}`
- v4 (tutti facoltativi, assenti = comportamento v3): account `icon` (nome di `PICK_ICONS` o null), `deposit` `{ start, withholdingBp (default 2600), rates: [{ from, rateBp }] }` (solo euro); category `icon`, `role` anche 'interessi' (id fisso `default-entrata-interessi`, creata da `upsertDerived` se manca); movement `split` `[{ person, amount }]` (uscita: `excluded` = somma), `person` (restituzione), `interest` `{ accountId, month }` (entrata automatica, id `interest-<conto>-<AAAA-MM>`), `align` `{ balance }` (variazione su conto euro, id `align-<conto>-<data>`, importo ricalcolato dal motore; letta anche se in tombstone), `importKey` (uscita/entrata importate da CSV). Operazioni atomiche dello store: `upsertDerived` (nessun commit se nulla cambia), `addMovements`, `settlePerson`.
- v5 (facoltativi): investment `name` (unico), `code` (ISIN o sigla, maiuscolo, o null), `color`, `order`, `taxRateBp` (predefinito 2600), `taxRegime` 'amministrato'|'dichiarativo', `prices` `[{ date, price }]` (price in unità 1e-4 €); movement `etfId`, `tax`, `taxRegime`: Compra ETF = trasferimento `trade:'compra'` con `accountId` euro, `toAccountId = etfId`, `amount` euro pagati, `amountTo` quote (1e-8), `price` (1e-4 €); Vendi = `accountId = etfId`, `toAccountId` euro, `amount` quote, `amountTo` euro arrivati (al netto della tassa in Amministrato), `tax`; dividendo = entrata con `etfId` nella categoria Dividendi (id fisso `default-entrata-dividendi`, ruolo `dividendi`, colore `#4F46E5`, creata dal foglio Dividendo se manca). Vendita oltre le quote bloccata ("Puoi vendere al massimo N quote"). La sync azzera una volta il cursore (`resyncV5`).
- v6 (facoltativo): account `prices` `[{ date, price }]` (solo crypto; price in centesimi per 1 unità intera, 2 decimali; null per i conti in euro; assente nei dati v1–v5). Una v5 lo conserva modificando il conto (`update` fa `{ ...prev, ...clean }`). Valore di 1 unità a una data = ultimo `prices` ≤ data, altrimenti `price` dell'ultima Compra crypto ≤ data ("prezzo d'acquisto"), altrimenti fuori dal patrimonio.
- goal: `name`, `target`, `saved`, `deadline`, `color`; v2: `monthly` (quota mensile, facoltativa) e `log` `{ 'AAAA-MM': centesimi con segno }` (aggiunte/tolte per mese). "Completato" = `saved ≥ target` (derivato)

Regole di calcolo: uscita contata = `amount − excluded` (anche nel CSV dalla v2); cash flow del mese in Home = entrate contate − uscite contate; entrate contate = solo `entrata`; trasferimenti, restituzioni e variazioni non contano mai negli aggregati; tasso di risparmio in decimi interi (entrate 0 → 0). Conti eliminati fuori dal patrimonio, i loro movimenti restano nelle statistiche. Evoluzione: solo campi facoltativi; per dati nuovi chiavi nuove; fixture `tests/fixtures/data-v1.json` da caricare identica.

## Rotte (v4 + v5, `js/routes.js`)
`#home`, `#da-confermare`, `#da-ricevere[?persona=]`, `#programmati[/<id>]`, `#movimenti?periodo=&da=&a=&conto=&categoria=&q=`, `#movimenti?vista=calendario&mese=&giorno=`, `#budget`, `#budget/obiettivi`, `#obiettivi/<id>`, `#statistiche?periodo=`, `#statistiche/stipendio?anno=`, `#statistiche/fondo-pensione`, `#conti`, `#conti/<id>`, `#investimenti/<id>` (v5; `#investimenti` → `#conti`), `#impostazioni[/tema|categorie|budget|periodo|backup|csv|importa|sync|installa]`.
Reindirizzate con la query: `#calendario` → `#movimenti?vista=calendario`, `#conti/obiettivi` e `#obiettivi` → `#budget/obiettivi`, `#impostazioni/fondo-pensione` → `#statistiche/fondo-pensione`. Sconosciute → `#home`.

## Scelte provvisorie della v6 (da confermare con l'utente)
Approvate dall'utente: valore crypto salvato nel conto (`account.prices`); nessun guadagno/perdita stimato sulle crypto. Provvisorie: prezzo crypto a 2 decimali; le Vendi crypto non cambiano il valore unitario; "di cui senza budget" e il consiglio discreto contano solo le uscite registrate; l'avviso al salvataggio di una spesa conta anche i programmati della categoria; con i dati vecchi il patrimonio cresce del valore delle crypto con una Compra (fixture v4 +1.080,00 €). Punto aperto: nessuna tassa sulle crypto.
Formula (risposta 1B): per categoria used = speso + programmati da pagare della categoria; barra rossa e "budget superati" se used > budget.

## Scelte provvisorie della v5 (da confermare con l'utente)
P1 ETF nella chiave `moneyflow:investments`; P2 Compra/Vendi ETF come trasferimenti con `etfId`; P3 quote a 1e-8, prezzo a 1e-4 €; P4 costo delle quote vendute proporzionale al centesimo "metà in su"; P5 tassa = max(0, plusvalenza) × aliquota, modificabile in Amministrato; P6 regime e tassa copiati sul movimento; P7 dividendi Amministrato netti, Dichiarativo lordi con tassa; P8 anno fiscale = anno della data, zainetto fino al 31/12 del 4° anno; P9 valore a una data = ultimo Aggiorna valore, altrimenti prezzo dell'ultimo acquisto; P10 ETF eliminato fuori da liste e patrimonio; P11 Quanto metti da parte in Home; P12 consiglio discreto (prima categoria senza budget, Altro a parte); P13 colore progressivo a 4 tappe; P14 CSV ETF come Trasferimento (punto aperto); P15 sync che rilegge tutto una volta; P16 tasse delle vendite fuori da budget e cash flow. Riepilogo tasse e zainetto sui soli ETF non eliminati.
Punti aperti: formato CSV degli ETF (il valore crypto scritto a mano è realizzato nella v6). Azioni aziendali (RSU) fuori dalla v5.

## Scelte provvisorie della v4 (da confermare con l'utente)
- Quanto ti resta (v4, dalla v5 solo senza budget) = entrate contate − uscite contate − uscite programmate non gestite del periodo (anche scadute); entrate programmate non contate. Puoi spendere oggi = rimanente / giorni fino alla fine compresi, per difetto; 0 se ≤ 0.
- Periodo di budget: preferenza del dispositivo (`prefs.budgetPeriod`, predefinito 'calendar'); 'salary' = dall'ultimo stipendio al giorno prima del successivo, fine stimata "+1 mese − 1 giorno", in ritardo fino a oggi; senza stipendi mese di calendario. Il budget di categoria vale per periodo. Statistiche e CSV a mesi.
- Interessi: dalla data di inizio a ieri sul saldo di fine giornata, base 365, ritenuta per giorno, accredito a 0,01 €, capitalizzazione giornaliera; un movimento Interessi (entrata) per mese per conto, data = ultimo giorno maturato; rettifica "Allinea al saldo reale" = variazione che non conta negli aggregati, "Rettifica saldo" nel CSV. Togliendo il deposito i movimenti già creati restano.
- Spesa divisa: persone solo come nomi sulla spesa, unite senza maiuscole; quote senza nome dei dati v1–v3 = "Senza nome"; nessun importo suggerito ("Dividi in parti uguali" non realizzato, D4).
- Import CSV: Revolut = data di completamento, Amount − Fee, solo COMPLETED in EUR; intestazioni italiane non verificate. Doppione = stessa importKey o stessa data ed effetto di un movimento senza importKey (uno a uno). Categoria dal movimento passato con la stessa descrizione.
- Netto dal PDF: Form XObject letti (`Do`), etichetta senza spazi, numeri spezzati uniti, scelta del candidato uguale a competenze − ritenute (± 1,00 €); senza etichetta netto calcolato con avviso.
- Fondo pensione in Statistiche, collegamento in Impostazioni → Strumenti. Patrimonio in Home solo come riga; il totale grande è in Conti.

## Scelte provvisorie della v2 (da richiedere all'utente)
- P1 `schemaVersion` resta 1: solo campi facoltativi, così la v1 legge i dati e i backup della v2 (e conserva i campi che non conosce).
- P2 Il lordo della v1 (`gross`) vale come "Competenze lorde (Totale competenze)", senza migrazione.
- P3 Impostazioni della stima (data di inizio rapporto, % addizionali, proiezione a mano) solo sul dispositivo in `moneyflow:tax`: non sincronizzate, non nel backup.
- P4 Mese della busta = mese della data dell'entrata; il mese letto dal PDF è solo mostrato, con avviso se diverso.
- P5 Prezzo unitario crypto con 2 decimali; importo arrotondato al centesimo "metà in su".
- P6 Compra/Vendi si aprono dalla pagina del conto crypto (serve un conto in euro); nel CSV restano "Trasferimento" con l'importo in uscita.
- P7 "Metti da parte" si apre dopo il salvataggio di una nuova entrata Stipendio (anche dalla conferma di un programmato, non da "Conferma tutte"); obiettivi con quota spuntati, senza quota non spuntati e vuoti; accantonamento nel mese della data dello stipendio. Un solo toast riassume quanto messo da parte e gli obiettivi completati.
- P8 Quota mensile facoltativa; senza quota resta il suggerimento v1 (residuo / mesi alla scadenza).
- P9 "Completato" derivato da `saved ≥ target`; si riapre alzando la cifra (Modifica) o con Togli; in Home solo gli obiettivi attivi.
- P10 Detrazione art. 13 TUIR: anche i 65 € sono rapportati ai giorni; minimo 690 € dopo il rapporto ai giorni.
- P11 Inclusa l'ulteriore detrazione del cuneo fiscale (L. 207/2024 art. 1 c. 6), rapportata ai giorni. Esclusi (detto nella schermata): somma esente fino a 20.000 €, trattamento integrativo, familiari a carico, oneri, altri redditi, imposte sostitutive (15% notturni/turni, 5% aumenti contrattuali).
- P12 Rapporti troncati alla 4ª cifra decimale (art. 13 c. 6 TUIR); giorni su base 365 (anche negli anni bisestili).
- P13 Proiezione: mesi lavorati dal mese di inizio rapporto a dicembre; i mancanti valgono la media dei registrati o i valori scritti a mano; avviso se un mese supera 1,5 × la mediana; tredicesima e quattordicesima non stimate a parte.
- P14 Addizionali con un'aliquota regionale e una comunale uniche (nessuno scaglione, nessuna esenzione comunale), zero se l'IRPEF netta è zero, 11 rate; nessun valore predefinito. Tabelle solo per il 2026.
- P15 Simulatore in Impostazioni → Strumenti (la schermata "Altro" non esiste), con collegamento da Stipendio e tasse; 14 mensilità, contributo base dipendente 1% e azienda 1% precompilati; risparmio IRPEF = differenza dell'imposta lorda a scaglioni; input non salvati.
- P16 Lettore PDF: font semplici (WinAnsi) e, per tentativo, mappe ToUnicode e object stream; filtri diversi da FlateDecode non supportati (messaggio). Le coordinate tengono conto di `cm`, `Tm`, `Td`.
- P17 Cash flow zero mostrato "0,00 €" in verde.
- P18 IRPEF mensile "come il software paghe" non calcolata.

## Scelte provvisorie della v1
Chiuse dalla v2: crypto nel patrimonio (confermato così), area Stipendio e tasse in Statistiche (confermata), lordo (sostituito dal modulo busta paga), CSV con l'importo contato (decisione v2 n. 6).
4. Verde smeraldo: chiaro `#047857`, scuro `#34D399` (pulsanti `#047857` con testo bianco).
5. Categorie iniziali e colori: quelle di D17, palette fissa di 12 colori.
6. Obiettivi nella scheda Conti con "Conti | Obiettivi".
7. Rotte come sopra.
8. Uscite, entrate e restituzioni solo su conti in euro; sui conti crypto: saldo iniziale, trasferimenti, "Variazione quantità".
9. Obiettivi aggiornati a mano (Aggiungi/Togli), non collegati a un conto; quota mensile = residuo / mesi rimasti (mese corrente incluso).
10. Saldo dei conti = iniziale + tutti i movimenti registrati (anche con data futura); i programmati non confermati non contano.
11. CSV: una riga per movimento; trasferimento come "A → B" (dalla v2 le uscite hanno l'importo contato).
12. Grafici: con un solo mese nel periodo, barre e linea mostrano i 6 mesi fino a quello.
13. Abbonamenti: uscite programmate ripetute non terminate; annuo settimanale ×52, mensile ×12, ogni N mesi ×12/N.
14. Avviso budget: barra rossa in Home + messaggio al salvataggio, nessuna notifica di sistema.
15. Sync solo con app aperta (avvio, ritorno in primo piano, 5 s dopo una modifica, "Sincronizza ora"); pull prima del push.

## Miglioramenti dei flussi (decisi dall'utente)
Approvati e realizzati: 1 scadenze arretrate raggruppate in Home + "Conferma tutte"; 2 inserimento nel giorno scelto del calendario; 3 "Programma un pagamento" porta importo e data già scritti; 4 tipo modificabile tra Uscita/Entrata/Trasferimento (bloccato se la spesa ha restituzioni); 5 budget, legenda della ciambella e tasso per mese aprono Movimenti filtrati; 6 "Non la ricevo più" in Da ricevere (quota esclusa = già restituito); 9 Stipendio prima tra le categorie di entrata, Lordo subito sotto l'importo.
Respinti dall'utente (non riproporre): 7 pulsante "Tutto" sulla restituzione (resta D4, nessun importo suggerito); 8 "Aggiungi un altro" nel toast.

Altre scelte tecniche: niente `preventDefault` su `beforeinstallprompt` (resta il banner di Chrome, più il pulsante Installa nelle Impostazioni); conferma di un programmato precompila l'importo scritto nel programmato (D18), voci recenti e restituzioni no (D4).

## Cosa non è stato provato
- v4: CSV vero di Revolut (intestazione italiana in particolare), PDF reale della busta (il caso a modulo è riprodotto solo con un PDF sintetico), interessi confrontati con un estratto Revolut vero.
- **Icona v3 su un telefono vero:** provati solo manifest letto da Chrome headless e dimensioni dei PNG; l'aggiornamento dell'icona di un'app già installata (Android WebAPK, iPhone) non è provato.
- **PDF reale della busta paga:** non è nella sandbox. Il lettore è provato solo con due PDF sintetici (dati inventati) generati da `tools/make_payslip_pdf.py`, con il testo simile alle righe descritte nelle decisioni v2. Va provato dall'utente sul telefono.
- Formule fiscali: provate su esempi calcolati a mano (`tests/tax.test.js`, `tests/pension.test.js`), non confrontate con una CU o un 730 veri.
- Firebase reale (nessun accesso a internet): la sync è provata solo con un `fetch` simulato nei test; in browser si è visto solo il messaggio "Impossibile raggiungere Firebase".
- Telefoni veri (Android/iPhone), installazione reale, condivisione con `navigator.share` (in headless si usa il download).
- Il selettore nativo delle date in headless mostra il formato della lingua del sistema; sui telefoni italiani è GG/MM/AAAA.
- Lighthouse non disponibile; l'installabilità è controllata con Chrome headless (`Page.getInstallabilityErrors`: nessun errore).
- Il banner Aggiorna è provato con versioni di prova in una copia dell'app, non con un vero aggiornamento su GitHub Pages.
- Dettagli della verifica finale: `.agents/tasks/moneyflow-v2/verifica.md` (v2) e `.agents/tasks/moneyflow-v1/verifica-finale.md` (v1), non pubblicati.
