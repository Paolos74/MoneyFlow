// Errori tipizzati dell'app: ValidationError ha il messaggio italiano da mostrare.

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class StorageError extends Error {
  constructor(message = 'Spazio di archiviazione pieno: i dati non sono stati salvati. Fai un backup ed elimina qualcosa.') {
    super(message);
    this.name = 'StorageError';
  }
}
