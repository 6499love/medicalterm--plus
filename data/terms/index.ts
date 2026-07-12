import { systemTermsData as legacySystemTermsData } from '../../system_terms_data-20260109';
import { bedTerms } from './bed_terms';
import { humidifierTerms } from './humidifier_terms';
import { microcirculationTerms } from './microcirculation_terms';

export const systemTermsData = [
  ...legacySystemTermsData,
  ...bedTerms,
  ...humidifierTerms,
  ...microcirculationTerms,
];
