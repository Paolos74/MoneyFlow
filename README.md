# MoneyFlow

App personale per gestire soldi, risparmi, stipendio e spese nel tempo. Funziona nel browser e si installa sul telefono (Android e iPhone). I dati restano sul dispositivo; la sincronizzazione online con Firebase è facoltativa.

Versione: **moneyflow-v4**

## Come si usa

- **Home:** il numero grande è **Quanto ti resta** nel periodo di budget: entrate contate − uscite contate − uscite programmate ancora da pagare nel periodo (anche quelle scadute da confermare). Es. entrate 2.000 €, uscite 650 €, affitto programmato 300 € → **1.050,00 €**. Verde se è zero o positivo, rosso se è negativo. Sotto c'è **Puoi spendere oggi**: quanto ti resta diviso i giorni che mancano alla fine del periodo, oggi compreso (es. 1.050 € e 10 giorni → 105,00 €; 0 se sei in rosso). Poi Entrate, Uscite, Programmati e il cash flow del periodo, Da confermare e poche righe secondarie (Chi mi deve, Budget e obiettivi, Pagamenti programmati, Patrimonio).
- **Schede in basso:** Home, Movimenti, Budget, Statistiche, Conti. Le Impostazioni si aprono dall'icona ⚙︎ in alto a destra nella Home. I vecchi indirizzi (`#calendario`, `#conti/obiettivi`…) portano da soli alla nuova posizione.
- **Periodo di budget:** Impostazioni → **Periodo di budget**: **Mese di calendario** (predefinito, dal 1° a fine mese) oppure **Dallo stipendio**: il periodo parte dalla data dell'ultima entrata Stipendio registrata e finisce il giorno prima dello stipendio dopo. Finché il nuovo stipendio non c'è, la fine è stimata alla stessa data del mese dopo; se lo stipendio è in ritardo il periodo arriva a oggi. Vale per Quanto ti resta, Puoi spendere oggi e i budget per categoria; Statistiche e CSV restano a mesi di calendario.
- **Pulsante +:** registra una spesa, un'entrata o un trasferimento. In cima ci sono le **voci recenti**: toccane una, scrivi l'importo e premi **Salva** (l'importo non viene mai suggerito).
- **Conti:** in euro (banca, contanti…) o in crypto (solo quantità, es. 0,05 BTC, nessun prezzo da internet). Ogni conto ha un saldo iniziale e un colore. Se elimini un conto, i suoi movimenti restano con l'etichetta "(eliminato)".
- **Trasferimenti:** spostano soldi tra due conti e non contano né come spesa né come entrata. Tra euro e crypto scrivi anche quanto è arrivato.
- **Compra e Vendi crypto:** apri il conto crypto (es. Coinbase) e tocca **Compra** o **Vendi**. Scrivi la quantità e il prezzo di 1 unità in euro: l'app calcola l'importo (quantità × prezzo, arrotondato al centesimo). Puoi correggerlo per le commissioni; **Ricalcola** torna al valore calcolato. Il conto in euro scende (Compra) o sale (Vendi) dell'importo, il conto crypto cambia della quantità. Come i trasferimenti, non conta nel cash flow.
- **Spesa divisa tra più persone:** su una spesa attiva "Escludi una quota" e scegli **Più persone**: per ognuno scrivi il nome e la sua quota (es. cena 90 €, Anna 30 €, Luca 30 €: il conto scende di 90 €, le statistiche contano 30 €). L'app non propone importi; i nomi già usati si scelgono dall'elenco. In **Da ricevere** la sezione **Chi mi deve** mostra quanto ti deve ogni persona su tutte le spese; tocca un nome per **Ha restituito tutto** (una restituzione per spesa, sul conto e nella data che scegli), **Non li ricevo più** (le sue quote tornano a contare come spesa) o **Registra restituzione** su una sola spesa, scegliendo chi restituisce.
- **Quota esclusa:** su una spesa attiva "Escludi una quota" (es. spesa 40 €, escludi 20 € anticipati per un amico). Il conto scende di 40 €, ma statistiche, budget e tasso di risparmio contano 20 €. I 20 € compaiono in Home → **Da ricevere**; quando l'amico ti restituisce i soldi tocca **Registra restituzione**: entrano nel conto ma non contano come entrata. Se sai che non li riavrai, tocca **Non la ricevo più**: la parte mancante torna a contare come spesa.
- **Pagamenti programmati:** Home → Pagamenti programmati (oppure + → Programma un pagamento: importo e data già scritti restano). Una volta, ogni settimana, ogni mese, ogni N mesi, ogni anno, con data di fine facoltativa. Alla scadenza **non** si registrano da soli: li trovi in Home → **Da confermare**, dove confermi (anche correggendo importo e data) o salti. Più scadenze arretrate dello stesso pagamento sono raggruppate in una riga, con **Conferma tutte**. Nel calendario i programmati hanno il contorno tratteggiato. Non ci sono notifiche.
- **Movimenti:** in alto **Lista | Calendario**. Il pulsante **Importa** apre l'importazione da CSV.
- **Calendario** (Movimenti → Calendario): tocca un giorno per vedere i suoi movimenti; il + e **Aggiungi in questo giorno** inseriscono un movimento con quella data.
- **Modifica:** ogni campo di un movimento si può cambiare, anche il tipo (Uscita, Entrata, Trasferimento), tranne per una spesa con restituzioni collegate.
- **Stipendio e busta paga:** registra lo stipendio come entrata nella categoria Stipendio (la prima delle categorie di entrata), con il **Netto a pagare** come importo. Sotto c'è il modulo **Busta paga (facoltativa)**: Competenze lorde (Totale competenze), Contributi a carico (900), Imponibile fiscale del mese (I01), IRPEF netta trattenuta (I21), Contributi fondo pensione (60450), Detrazioni del mese. Il "Lordo" scritto con la versione precedente compare come Competenze lorde. Il mese della busta è quello della data dell'entrata.
- **Leggi busta paga (PDF), sperimentale:** nel modulo tocca **Leggi busta paga (PDF)** e scegli il PDF dal telefono. Il file viene letto **solo sul telefono** (non viene salvato né inviato) e riempie i campi che trova: controllali e premi **Salva**. Se il PDF è una scansione, è protetto o ha un formato diverso, compare un messaggio e i campi si compilano a mano. Dalla v4 compila **anche il Netto a pagare** quando l'etichetta "NETTO A PAGARE" è in un modello di sfondo del PDF o scritta a lettere staccate, e sceglie l'importo vicino all'etichetta che coincide con Totale competenze − Totale ritenute (riga Ferie). Se l'etichetta non si trova, il netto è calcolato così e compare l'avviso "Netto calcolato… controllalo sulla busta". È stato provato con PDF di prova, non con una busta paga vera: provalo e controlla i numeri.
- **Stipendio e tasse** (Statistiche → Stipendio e tasse): totali dell'anno (competenze, contributi, imponibile, IRPEF trattenuta, netto) e la **stima delle tasse**: IRPEF dovuta sull'anno con gli scaglioni 2026 e le detrazioni per lavoro dipendente rapportate ai giorni lavorati, confronto con l'IRPEF trattenuta (**Rimborso stimato** o **Da pagare stimati**) e le addizionali regionale e comunale dell'anno dopo (11 rate). I mesi che mancano valgono come la media dei mesi registrati, oppure come i valori che scrivi tu. In **Impostazioni della stima** scrivi la data di inizio rapporto, le percentuali delle addizionali (le trovi nella CU o sui siti di Regione e Comune) e, se un bonus falsa la media, l'imponibile e l'IRPEF per ogni mese mancante. **È una stima**: non sostituisce la Certificazione Unica (CU) né il 730.
- **Se aumento il fondo pensione** (Statistiche, oppure da Stipendio e tasse; resta un collegamento in Impostazioni → Strumenti): scrivi la retribuzione base, la percentuale volontaria attuale e quella nuova; vedi quanto versi in più, quanta IRPEF risparmi, di quanto scende il netto e quanto spazio deducibile resta rispetto al limite di 5.164,57 € l'anno. I valori non vengono salvati.
- **Budget** (scheda Budget): **Rimanente** con quanto ti resta e puoi spendere oggi, **Piano** con il budget di ogni categoria nel periodo (barra rossa se lo superi; si imposta da **Modifica** o Impostazioni → Budget) e **Andamento** con le prime categorie di spesa. Tocca un budget, o una categoria nella ciambella di Statistiche, per vedere le spese di quella categoria.
- **Obiettivi:** Budget → Obiettivi. Nome, cifra da raggiungere, **quota mensile** e scadenza (facoltative). Vedi quanto hai messo da parte questo mese rispetto alla quota (es. "30,00 € di 50,00 € questo mese"). Quando salvi un nuovo stipendio si apre **Metti da parte** con le quote già spuntate: cambia le cifre o togli le spunte e tocca **Conferma**, oppure **Salta**. I soldi restano sul conto: l'obiettivo tiene solo il conto. Raggiunta la cifra l'obiettivo diventa **Completato ✓** e passa nella sezione **Completati**; per riaprirlo alza la cifra con **Modifica** o usa **Togli**.

- **Conti** (scheda Conti): in alto il **totale del patrimonio** (conti in euro e depositi), poi Conti in euro, Depositi e Crypto (solo quantità). Ogni conto e categoria ha un'**icona** che scegli nel suo foglio (Modifica).
- **Interessi** di un conto deposito: entrata nella categoria **Interessi** (contano nel cash flow, nel tasso di risparmio e in Quanto ti resta). Le rettifiche di Allinea al saldo reale non contano né come entrata né come uscita; nel CSV hanno tipo "Rettifica saldo".

## Conto deposito con interessi automatici (es. Revolut)

1. Scheda **Conti** → tocca il conto (o **Nuovo** per crearlo) → **Modifica**.
2. Attiva **Deposito senza vincoli**.
3. **Tasso annuo lordo (%)**: quello del tuo piano, come lo vedi nell'app Revolut nella sezione del conto deposito (l'app non ne propone uno).
4. **Ritenuta (%)**: 26 (già scritto; cambialo solo se la tua è diversa).
5. **Data di inizio**: il giorno da cui il conto matura interessi. **Salva**.

Da quel momento l'app calcola ogni giorno gli interessi sul saldo di fine giornata (tasso / 365, ritenuta trattenuta, i centesimi sotto 0,01 € si accumulano come fa Revolut) dalla data di inizio fino a ieri, e li aggiunge **da sola** ogni volta che apri l'app, recuperando i giorni passati. Non crea un movimento al giorno: c'è **un movimento "Interessi" per mese**, aggiornato ogni giorno. Nella pagina del conto la card **Interessi** mostra tasso, interessi netti del mese e dell'anno e la ritenuta stimata.
- Se Revolut cambia il tasso: pagina del conto → **Cambia tasso da una data**.
- Se il saldo dell'app è diverso da quello di Revolut: pagina del conto → **Allinea al saldo reale**, scrivi il saldo che vedi e la data. La differenza diventa una rettifica che tiene il saldo uguale a quello scritto.

## Importare movimenti da CSV

Impostazioni → **Importa movimenti (CSV)** (oppure Movimenti → **Importa**) → **Scegli il file CSV**.
- **Revolut:** nell'app Revolut esporta l'estratto conto in formato CSV e sceglilo: viene riconosciuto da solo. Si importano solo le righe completate in euro, con la data di completamento e l'importo meno la commissione.
- **Altri file:** scegli le colonne Data, Descrizione e Importo; attiva **Inverti segno** se nel file le uscite sono positive.

Scegli il conto e la categoria per uscite ed entrate (una descrizione già usata riprende la sua categoria; puoi cambiarla riga per riga), controlla l'anteprima e tocca **Importa N movimenti**. Le righe già presenti (stesso file importato di nuovo, o stessa data e importo di un movimento inserito a mano) partono non spuntate con "Già presente". Il file viene letto solo sul telefono.

## Backup

Impostazioni → **Backup** → **Esporta backup** salva un file `MoneyFlow_backup_AAAA-MM-GG.json`. Conservalo su Drive, email o computer. Se l'ultimo backup ha più di 30 giorni, la Home te lo ricorda.

Per ripristinare: Impostazioni → Backup → **Importa backup** e scegli il file. Prima dell'importazione l'app salva una copia dei dati attuali, che puoi riprendere con **Ripristina i dati di prima**.

## Esportare in CSV

Impostazioni → **Esporta CSV**: scegli il periodo e il formato.
- **Excel italiano** (separatore `;`) per Excel in italiano.
- **Numbers, Fogli, iPhone** (separatore `,`) per Numbers, Google Fogli, l'anteprima dell'iPhone ed Excel non italiano.

Le uscite hanno il segno meno e l'**importo contato**: per una spesa di 40 € con 20 € esclusi il CSV riporta -20,00. Compra e Vendi compaiono come trasferimenti con l'importo uscito dal conto.

Se aprendo il file vedi tutto nella colonna A, riesporta con l'altro formato. L'app ricorda l'ultima scelta.

## Installare l'app

**Android (Chrome):** apri l'indirizzo dell'app → menu **⋮** → **Installa app** (*Install app*) oppure **Aggiungi a schermata Home** (*Add to Home screen*) → **Installa**.

**iPhone (Safari):** apri l'indirizzo in Safari → **Condividi** (quadrato con freccia) → **Aggiungi alla schermata Home** (*Add to Home Screen*) → **Aggiungi** (*Add*).
Importante: su iPhone un sito non installato può perdere i dati dopo circa 7 giorni senza visite. Installala e fai un backup ogni tanto.

## Prima pubblicazione su GitHub Pages

1. Su github.com, in alto a destra **+** → **New repository** (*Nuovo repository*). Nome, ad esempio, `moneyflow`. Scegli **Public** → **Create repository**.
2. Nella pagina del repository tocca **uploading an existing file** (oppure **Add file** → **Upload files**).
3. Apri lo zip sul computer e **trascina il contenuto** (i file e le cartelle `css`, `icons`, `js`… non la cartella che li contiene) nella pagina. Le cartelle vanno trascinate: "choose your files" non le carica.
4. In basso premi **Commit changes**.
5. Vai in **Settings** → **Pages**. In **Build and deployment** scegli **Deploy from a branch**, poi branch **main** e cartella **/(root)** → **Save**.
6. Dopo 1–2 minuti l'app è su `https://<tuo-utente>.github.io/moneyflow/`.

**Icona dell'app:** è nella cartella `icons/` (file `moneyflow-v4-…png` e `moneyflow-v4-favicon.svg`), che va caricata insieme alle altre. Per controllare apri `https://<tuo-utente>.github.io/moneyflow/icons/moneyflow-v4-192.png`: se non vedi le due banconote (una dorata e una verde con il simbolo €), la cartella manca.

Se vedi una pagina senza stile con un'icona gigante, le cartelle `css/` e `js/` non sono state caricate (oppure hai aperto `index.html` con doppio clic dal computer). Controlla aprendo `https://<tuo-utente>.github.io/moneyflow/css/app.css`, poi ricarica con Ctrl+F5.

## Aggiornamenti

Per ogni aggiornamento riceverai uno zip con **solo i file cambiati** e l'elenco dei file da cancellare. Su GitHub: **Add file** → **Upload files** → trascina il contenuto dello zip (cartelle comprese) → **Commit changes**. Poi riapri l'app e tocca **Aggiorna** sul banner "Nuova versione disponibile". L'app non si ricarica mai da sola, così non perdi un inserimento a metà.

**Icona nuova (dalla v3):** su Android Chrome aggiorna da solo l'icona dell'app installata, di solito entro qualche giorno; se vuoi vederla subito tieni premuta l'icona → **Disinstalla** (*Uninstall*), poi riapri l'indirizzo in Chrome → menu **⋮** → **Installa app**. Su iPhone l'icona si legge solo quando aggiungi l'app alla Home: tieni premuta l'icona → **Rimuovi app** (*Remove App*) → **Rimuovi dalla schermata Home**, poi Safari → **Condividi** → **Aggiungi alla schermata Home**. Prima fai un backup (Impostazioni → Backup), perché su iPhone togliere l'app può cancellare i suoi dati.

## Sincronizzazione con Firebase (facoltativa, gratuita)

Serve per usare gli stessi dati su Android e iPhone. Senza, l'app funziona lo stesso.

1. Vai su **console.firebase.google.com** → **Crea un progetto** (*Create a project*). Piano **Spark** (gratuito, senza carta di credito). Google Analytics non serve.
2. Nella pagina del progetto aggiungi un'app **Web** (icona `</>`), dai un nome, **non** attivare Hosting → **Registra app**. Copia i valori `apiKey` e `projectId`.
3. Menu **Authentication** → **Inizia** (*Get started*) → **Metodo di accesso** (*Sign-in method*) → **Email/password** → attiva **solo il primo interruttore** → **Salva**. Poi scheda **Utenti** (*Users*) → **Aggiungi utente** (*Add user*) con la tua email e una password lunga e diversa dalle altre.
4. Menu **Firestore Database** → **Crea database** (*Create database*):
   - versione **Standard**, ID `(default)`;
   - località **`eur3` (Europe)** oppure `europe-west8` (Milano), da non lasciare su `nam5`;
   - **modalità produzione** (*production mode*);
   - salta i backup pianificati.
5. Scheda **Regole** (*Rules*): cancella tutto, incolla questo testo e premi **Pubblica** (*Publish*):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/records/{recordId} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
6. Protezioni:
   - **Authentication** → **Impostazioni** (*Settings*) → **Azioni utente** (*User actions*): **disattiva** "Abilita creazione" (*Enable create / sign-up*), così nessun altro può registrarsi.
   - Su **console.cloud.google.com** (stesso progetto) → **API e servizi** → **Credenziali** (*Credentials*) → apri la chiave del browser → **Limitazioni delle applicazioni**: **Referrer HTTP**, aggiungi `https://<tuo-utente>.github.io/*`. In **Limitazioni API** scegli **Identity Toolkit API**, **Token Service API** e **Cloud Firestore API** → **Salva**.
7. Nell'app: Impostazioni → **Sincronizzazione** → incolla **API key** e **Project ID**, scrivi email e password → **Accedi e sincronizza**. In Firebase → Firestore → **Dati** deve comparire la raccolta `users`.

La password non viene salvata sul telefono. API key e Project ID non sono segreti: i dati sono protetti dalle regole del punto 5. La sincronizzazione avviene solo con l'app aperta (all'apertura, al ritorno nell'app e pochi secondi dopo una modifica, oppure con **Sincronizza ora**). Se due telefoni modificano la stessa voce, vince la modifica più recente.

In alternativa, chi pubblica può scrivere API key e Project ID nel file `js/firebase-config.js`, così non vanno inseriti a mano su ogni telefono.
