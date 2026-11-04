# CONTESTO di MoneyFlow (per le chat future)

PWA statica personale per un'utente italiana non sviluppatrice: spese, entrate, stipendio, conti in euro e crypto, calendario, pagamenti programmati, budget, obiettivi, statistiche, backup/CSV, sync Firebase facoltativa.
Metodo e stack: `PWA-BASE.md` (vincolante). Decisioni dell'utente: `MONEYFLOW-DECISIONI.md` (D1–D24, A–I); qui c'è solo ciò che serve per lavorare sul codice.

- Versione: `moneyflow-v1` (`VERSION` in `sw.js`), prima pubblicazione su GitHub Pages: lo zip contiene tutti i file dell'app.
- Commit in testa al rilascio: il commit "chore: verifica finale e preparazione del rilascio moneyflow-v1" sul branch `moneyflow-v1` (lo sha esatto con `git log -1 main` dopo il merge `--ff-only`). Per il prossimo zip: `git diff --name-only <questo commit> HEAD`.
- Nessun riferimento al lavoro dell'utente nei file (controllato da `tests/static.test.js`).

## Comandi
- Test: `node --test tests/*.test.js`
- Sintassi: `for f in $(git ls-files -co --exclude-standard '*.js'); do node --check "$f" || exit 1; done`
- Icone: `python3 tools/make_icons.py`
- Browser: dalla cartella sopra `python3 -m http.server 8765` → `http://localhost:8765/moneyflow/`

## File principali
`js/money.js` (centesimi, quantità 1e-8), `js/dates.js` (date locali, periodi D8), `js/recurrence.js`, `js/store.js` (modello, validazione, tombstone), `js/calc.js` (aggregati puri), `js/csv.js`, `js/backup.js`, `js/sync.js` (+ `js/firebase-config.js`), `js/prefs.js`, `js/theme-boot.js`, `js/ui.js`, `js/charts.js`, `js/icons.js`, `js/app.js` (router, SW, banner), `js/views/*.js` (una vista per schermata; `parts.js` pezzi condivisi; `movimento-form.js` tutti i fogli di inserimento).

## Chiavi localStorage
- `moneyflow:data` — `{ app:'MoneyFlow', schemaVersion:1, accounts, categories, movements, scheduled, goals }`
- `moneyflow:prefs` — tema, formato CSV, `lastBackupAt`, `firstUseAt`, `lastPeriod`, `beforeImportKey` (solo dispositivo, non sincronizzate)
- `moneyflow:sync` — apiKey, projectId, email, uid, token, cursore, `dirty`, ultimo esito (mai la password)
- `moneyflow:data:corrupt-<ms>` — copia grezza di dati illeggibili; `moneyflow:data:before-import-<ms>` — copia prima di un'importazione

## Modello dati (v1)
Ogni record: `id`, `createdAt`, `updatedAt` (ms), `deleted`. Importi interi: centesimi per l'euro, unità 1e-8 per le crypto.
- account: `name` (unico), `kind` 'eur'|'crypto', `asset` (crypto), `initial`, `color`, `order`
- category: `name` (unico per tipo), `type` 'uscita'|'entrata', `color`, `budget` (uscite), `role` ('stipendio'), `order`
- movement: `type` uscita|entrata|trasferimento|restituzione|variazione, `date`, `amount` (variazione con segno), `accountId`, `toAccountId`, `amountTo` (solo se unità diverse), `categoryId`, `description`, `note`, `excluded` (uscita), `refundOf` (restituzione → uscita), `gross` (entrata), `scheduledId`, `occurrence`
- scheduled: `type` uscita|entrata|trasferimento, `amount`, conti, `categoryId`, `description`, `start`, `freq` once|weekly|monthly|months|yearly, `interval`, `end`, `handled` `{data: 'confermato'|'saltato'}`
- goal: `name`, `target`, `saved`, `deadline`, `color`

Regole di calcolo: uscita contata = `amount − excluded`; entrate contate = solo `entrata`; trasferimenti, restituzioni e variazioni non contano mai negli aggregati; tasso di risparmio in decimi interi (entrate 0 → 0). Conti eliminati fuori dal patrimonio, i loro movimenti restano nelle statistiche. Evoluzione: solo campi facoltativi; per dati nuovi chiavi nuove; fixture `tests/fixtures/data-v1.json` da caricare identica.

## Rotte
`#home`, `#da-confermare`, `#da-ricevere`, `#programmati[/<id>]`, `#movimenti?periodo=&da=&a=&conto=&categoria=&q=`, `#calendario?mese=&giorno=`, `#statistiche?periodo=`, `#statistiche/stipendio?anno=`, `#conti`, `#conti/obiettivi`, `#conti/<id>`, `#obiettivi/<id>`, `#impostazioni[/tema|categorie|budget|backup|csv|sync|installa]`. Sconosciute → `#home`.

## Scelte provvisorie (da richiedere all'utente)
1. **Crypto nel patrimonio:** il totale in euro somma solo i conti in euro; le crypto sono una riga a parte con le quantità ("senza valore in euro"). Comprare crypto da un conto in euro abbassa il patrimonio in euro. Domanda: valore inserito a mano, costo d'acquisto, o lasciare così? (Reversibile: nessun dato salvato.)
2. **Lordo:** facoltativo su ogni singola entrata (`gross`), mostrato per la categoria Stipendio. Domanda: per stipendio o per mese? Servono altri dati (IRPEF, contributi, addizionali, CU)?
3. **Area lordo/tasse:** in Statistiche → Stipendio e tasse. Domanda: va bene lì o in Home/Conti?
4. Verde smeraldo: chiaro `#047857`, scuro `#34D399` (pulsanti `#047857` con testo bianco).
5. Categorie iniziali e colori: quelle di D17, palette fissa di 12 colori.
6. Obiettivi nella scheda Conti con "Conti | Obiettivi".
7. Rotte come sopra.
8. Uscite, entrate e restituzioni solo su conti in euro; sui conti crypto: saldo iniziale, trasferimenti, "Variazione quantità".
9. Obiettivi aggiornati a mano (Aggiungi/Togli), non collegati a un conto; quota mensile = residuo / mesi rimasti (mese corrente incluso).
10. Saldo dei conti = iniziale + tutti i movimenti registrati (anche con data futura); i programmati non confermati non contano.
11. CSV: una riga per movimento; uscite con l'importo intero pagato (la quota esclusa resta nel backup); trasferimento come "A → B".
12. Grafici: con un solo mese nel periodo, barre e linea mostrano i 6 mesi fino a quello.
13. Abbonamenti: uscite programmate ripetute non terminate; annuo settimanale ×52, mensile ×12, ogni N mesi ×12/N.
14. Avviso budget: barra rossa in Home + messaggio al salvataggio, nessuna notifica di sistema.
15. Sync solo con app aperta (avvio, ritorno in primo piano, 5 s dopo una modifica, "Sincronizza ora"); pull prima del push.

## Miglioramenti dei flussi (decisi dall'utente)
Approvati e realizzati: 1 scadenze arretrate raggruppate in Home + "Conferma tutte"; 2 inserimento nel giorno scelto del calendario; 3 "Programma un pagamento" porta importo e data già scritti; 4 tipo modificabile tra Uscita/Entrata/Trasferimento (bloccato se la spesa ha restituzioni); 5 budget, legenda della ciambella e tasso per mese aprono Movimenti filtrati; 6 "Non la ricevo più" in Da ricevere (quota esclusa = già restituito); 9 Stipendio prima tra le categorie di entrata, Lordo subito sotto l'importo.
Respinti dall'utente (non riproporre): 7 pulsante "Tutto" sulla restituzione (resta D4, nessun importo suggerito); 8 "Aggiungi un altro" nel toast.

Altre scelte tecniche: niente `preventDefault` su `beforeinstallprompt` (resta il banner di Chrome, più il pulsante Installa nelle Impostazioni); conferma di un programmato precompila l'importo scritto nel programmato (D18), voci recenti e restituzioni no (D4).

## Cosa non è stato provato
- Firebase reale (nessun accesso a internet): la sync è provata solo con un `fetch` simulato nei test; in browser si è visto solo il messaggio "Impossibile raggiungere Firebase".
- Telefoni veri (Android/iPhone), installazione reale, condivisione con `navigator.share` (in headless si usa il download).
- Il selettore nativo delle date in headless mostra il formato della lingua del sistema; sui telefoni italiani è GG/MM/AAAA.
- Lighthouse non disponibile; l'installabilità è controllata con Chrome headless (`Page.getInstallabilityErrors`: nessun errore).
- Il banner Aggiorna è provato con versioni di prova in una copia dell'app, non con un vero aggiornamento su GitHub Pages.
- Dettagli della verifica finale: `.agents/tasks/moneyflow-v1/verifica-finale.md` (non pubblicato).
