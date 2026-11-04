// Simulatore "Se aumento il fondo pensione": contributo in più, risparmio IRPEF, calo del netto, limite deducibile.
// Funzioni pure in centesimi e punti base. È una stima.
//
// Riferimenti: TUIR art. 10 c. 1 lett. e-bis e D.Lgs. 252/2005 art. 8 c. 4: i contributi alla previdenza
// complementare (dipendente + azienda, TFR escluso) si deducono dal reddito fino a 5.164,57 € l'anno.
// D.Lgs. 252/2005 art. 11 c. 6: in uscita la prestazione è tassata al 15%, che scende di 0,30 punti per ogni
// anno di adesione oltre il 15°, fino al 9%.

import { ValidationError } from './errors.js';
import { irpefGross } from './tax.js';

const round = (n, d) => Math.floor((2 * n + d) / (2 * d)); // interi ≥ 0, metà in su

export function simulatePension({ base, currentBp, newBp, months = 14, annualTaxable, employeeBaseBp = 100, employerBp = 100, regionalBp = null, municipalBp = null }, table) {
  if (newBp < currentBp) throw new ValidationError('La nuova percentuale deve essere maggiore di quella attuale', 'pf-new');
  const delta = newBp - currentBp;
  const limit = table.pensionDeductibleLimit;
  const extraPerMonth = round(base * delta, 10000);
  const extraYear = round(base * delta * months, 10000);
  const currentDeductible = round(base * months * (employeeBaseBp + currentBp + employerBp), 10000);
  const newDeductible = round(base * months * (employeeBaseBp + newBp + employerBp), 10000);
  // Solo la parte entro il limite riduce l'imponibile.
  const deductibleExtra = Math.min(extraYear, Math.max(0, limit - currentDeductible));
  // Differenza dell'imposta lorda a scaglioni (TUIR art. 11): gestisce il passaggio da uno scaglione all'altro.
  const t = Math.max(0, annualTaxable || 0);
  const irpefSaving = irpefGross(t, table) - irpefGross(Math.max(0, t - deductibleExtra), table);
  const surchargeSaving = regionalBp === null || regionalBp === undefined || municipalBp === null || municipalBp === undefined
    ? null
    : round(deductibleExtra * (regionalBp + municipalBp), 10000);
  const netDropPerMonth = months > 0 ? Math.round((extraYear - irpefSaving) / months) : 0;
  return {
    extraPerMonth, extraYear, currentDeductible, newDeductible,
    residual: limit - newDeductible, overLimit: newDeductible > limit, limit,
    deductibleExtra, irpefSaving, surchargeSaving, netDropPerMonth,
  };
}
