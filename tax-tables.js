// Tabelle IRPEF per anno (solo dati, in centesimi e punti base): scaglioni, detrazioni, limiti.
// Per un anno nuovo basta aggiungere una voce. Fonti nei commenti di ogni riga.

export const TAX_TABLES = {
  2026: {
    // TUIR (DPR 917/1986) art. 11 c. 1: 23% fino a 28.000 €, 33% fino a 50.000 € (aliquota scesa dal 35%
    // con la L. 30/12/2025 n. 199, Legge di Bilancio 2026, art. 1 c. 3), 43% oltre.
    brackets: [
      { upTo: 2800000, rateBp: 2300 },
      { upTo: 5000000, rateBp: 3300 },
      { upTo: null, rateBp: 4300 },
    ],
    // TUIR art. 13 c. 1 (detrazione lavoro dipendente, testo del D.Lgs. 216/2023 e della L. 207/2024):
    // 1.955 € fino a 15.000 € (minimo 690 € a tempo indeterminato); 1.910 + 1.190 × (28.000 − r)/13.000
    // fino a 28.000 €; 1.910 × (50.000 − r)/22.000 fino a 50.000 €; c. 1.1: +65 € tra 25.000 e 35.000 €.
    employee: { low: 1500000, lowAmount: 195500, minAmount: 69000, mid: 2800000, midBase: 191000, midExtra: 119000, high: 5000000, bonusFrom: 2500000, bonusTo: 3500000, bonus: 6500 },
    // L. 30/12/2024 n. 207 art. 1 c. 6 (cuneo fiscale): ulteriore detrazione di 1.000 € tra 20.000 e 32.000 €,
    // poi 1.000 × (40.000 − r)/8.000 fino a 40.000 €.
    extra: { from: 2000000, full: 3200000, to: 4000000, amount: 100000 },
    // Giorni dell'anno per rapportare le detrazioni al periodo di lavoro (base 365, anche negli anni bisestili).
    daysBase: 365,
    // D.Lgs. 252/2005 art. 8 c. 4: contributi alla previdenza complementare deducibili fino a 5.164,57 € l'anno.
    pensionDeductibleLimit: 516457,
  },
};
