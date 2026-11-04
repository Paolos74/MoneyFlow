# MoneyFlow

App personale per gestire soldi, risparmi, stipendio e spese nel tempo. Funziona nel browser e si installa sul telefono (Android e iPhone). I dati restano sul dispositivo; la sincronizzazione online con Firebase è facoltativa.

Versione: **moneyflow-v3**

## Come si usa

- **Home:** il numero grande della card del mese è il **cash flow** del mese: entrate contate − uscite contate (es. **+1.300,00 €** se sono entrati 2.600 € e ne sono usciti 1.300 €). Verde se è zero o positivo, rosso se è negativo. Sotto restano Entrate, Uscite e Risparmio %.
- **Schede in basso:** Home, Movimenti, Calendario, Statistiche, Conti. Le Impostazioni si aprono dall'icona ⚙︎ in alto a destra nella Home.
- **Pulsante +:** registra una spesa, un'entrata o un trasferimento. In cima ci sono le **voci recenti**: toccane una, scrivi l'importo e premi **Salva** (l'importo non viene mai suggerito).
- **Conti:** in euro (banca, contanti…) o in crypto (solo quantità, es. 0,05 BTC, nessun prezzo da internet). Ogni conto ha un saldo iniziale e un colore. Se elimini un conto, i suoi movimenti restano con l'etichetta "(eliminato)".
- **Trasferimenti:** spostano soldi tra due conti e non contano né come spesa né come entrata. Tra euro e crypto scrivi anche quanto è arrivato.
- **Compra e Vendi crypto:** apri il conto crypto (es. Coinbase) e tocca **Compra** o **Vendi**. Scrivi la quantità e il prezzo di 1 unità in euro: l'app calcola l'importo (quantità × prezzo, arrotondato al centesimo). Puoi correggerlo per le commissioni; **Ricalcola** torna al valore calcolato. Il conto in euro scende (Compra) o sale (Vendi) dell'importo, il conto crypto cambia della quantità. Come i trasferimenti, non conta nel cash flow.
- **Quota esclusa:** su una spesa attiva "Escludi una quota" (es. spesa 40 €, escludi 20 € anticipati per un amico). Il conto scende di 40 €, ma statistiche, budget e tasso di risparmio contano 20 €. I 20 € compaiono in Home → **Da ricevere**; quando l'amico ti restituisce i soldi tocca **Registra restituzione**: entrano nel conto ma non contano come entrata. Se sai che non li riavrai, tocca **Non la ricevo più**: la parte mancante torna a contare come spesa.
- **Pagamenti programmati:** Home → Pagamenti programmati (oppure + → Programma un pagamento: importo e data già scritti restano). Una volta, ogni settimana, ogni mese, ogni N mesi, ogni anno, con data di fine facoltativa. Alla scadenza **non** si registrano da soli: li trovi in Home → **Da confermare**, dove confermi (anche correggendo importo e data) o salti. Più scadenze arretrate dello stesso pagamento sono raggruppate in una riga, con **Conferma tutte**. Nel calendario i programmati hanno il contorno tratteggiato. Non ci sono notifiche.
- **Calendario:** tocca un giorno per vedere i suoi movimenti; il + e **Aggiungi in questo giorno** inseriscono un movimento con quella data.
- **Modifica:** ogni campo di un movimento si può cambiare, anche il tipo (Uscita, Entrata, Trasferimento), tranne per una spesa con restituzioni collegate.
- **Stipendio e busta paga:** registra lo stipendio come entrata nella categoria Stipendio (la prima delle categorie di entrata), con il **Netto a pagare** come importo. Sotto c'è il modulo **Busta paga (facoltativa)**: Competenze lorde (Totale competenze), Contributi a carico (900), Imponibile fiscale del mese (I01), IRPEF netta trattenuta (I21), Contributi fondo pensione (60450), Detrazioni del mese. Il "Lordo" scritto con la versione precedente compare come Competenze lorde. Il mese della busta è quello della data dell'entrata.
- **Leggi busta paga (PDF), sperimentale:** nel modulo tocca **Leggi busta paga (PDF)** e scegli il PDF dal telefono. Il file viene letto **solo sul telefono** (non viene salvato né inviato) e riempie i campi che trova: controllali e premi **Salva**. Se il PDF è una scansione, è protetto o ha un formato diverso, compare un messaggio e i campi si compilano a mano. È stato provato con un PDF di prova, non con una busta paga vera: provalo e controlla i numeri.
- **Stipendio e tasse** (Statistiche → Stipendio e tasse): totali dell'anno (competenze, contributi, imponibile, IRPEF trattenuta, netto) e la **stima delle tasse**: IRPEF dovuta sull'anno con gli scaglioni 2026 e le detrazioni per lavoro dipendente rapportate ai giorni lavorati, confronto con l'IRPEF trattenuta (**Rimborso stimato** o **Da pagare stimati**) e le addizionali regionale e comunale dell'anno dopo (11 rate). I mesi che mancano valgono come la media dei mesi registrati, oppure come i valori che scrivi tu. In **Impostazioni della stima** scrivi la data di inizio rapporto, le percentuali delle addizionali (le trovi nella CU o sui siti di Regione e Comune) e, se un bonus falsa la media, l'imponibile e l'IRPEF per ogni mese mancante. **È una stima**: non sostituisce la Certificazione Unica (CU) né il 730.
- **Se aumento il fondo pensione** (Impostazioni → Strumenti, oppure da Stipendio e tasse): scrivi la retribuzione base, la percentuale volontaria attuale e quella nuova; vedi quanto versi in più, quanta IRPEF risparmi, di quanto scende il netto e quanto spazio deducibile resta rispetto al limite di 5.164,57 € l'anno. I valori non vengono salvati.
- **Budget:** Impostazioni → Budget, un importo al mese per categoria. Se lo superi la barra in Home diventa rossa. Tocca un budget in Home, o una categoria nella ciambella di Statistiche, per vedere le spese di quella categoria.
- **Obiettivi:** Conti → Obiettivi. Nome, cifra da raggiungere, **quota mensile** e scadenza (facoltative). Vedi quanto hai messo da parte questo mese rispetto alla quota (es. "30,00 € di 50,00 € questo mese"). Quando salvi un nuovo stipendio si apre **Metti da parte** con le quote già spuntate: cambia le cifre o togli le spunte e tocca **Conferma**, oppure **Salta**. I soldi restano sul conto: l'obiettivo tiene solo il conto. Raggiunta la cifra l'obiettivo diventa **Completato ✓** e passa nella sezione **Completati**; per riaprirlo alza la cifra con **Modifica** o usa **Togli**.

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

**Icona dell'app:** è nella cartella `icons/` (file `moneyflow-v3-…png`), che va caricata insieme alle altre. Per controllare apri `https://<tuo-utente>.github.io/moneyflow/icons/moneyflow-v3-192.png`: se non vedi la moneta d'oro con la freccia, la cartella manca.

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
