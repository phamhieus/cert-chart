/**
 * The certification catalogue. Everything the parser knows about lives here, so
 * adding a credential is a one-entry change.
 *
 * Aliases are matched case-insensitively against normalised text (see
 * `normalizeText` in the parser). Hyphen variants are generated automatically:
 * `"az-900"` also matches `"az 900"` and `"az900"`, so only one spelling is
 * listed here.
 *
 * Deliberately NOT listed as standalone aliases, because they collide with
 * everyday words or other products and would wreck precision:
 *   - "SAP"  -> the ERP vendor. Only "sap-c02"/"aws sap"/the full name count.
 *   - "ACE"  -> an English word. Only "gcp ace"/"associate cloud engineer".
 *   - "PCA"  -> principal component analysis, among others.
 */
export type CertificationId =
  | 'aws-saa'
  | 'aws-dva'
  | 'aws-sap'
  | 'az-900'
  | 'az-104'
  | 'gcp-ace'
  | 'gcp-pca'
  | 'cka'
  | 'ckad'
  | 'istqb-ctfl'
  | 'ccna'
  | 'comptia-security-plus';

export type Certification = {
  id: CertificationId;
  /** Canonical name every alias normalises to. */
  name: string;
  /** Compact label for narrow screens. */
  shortName: string;
  vendor: string;
  aliases: string[];
};

export const CERTIFICATIONS: Certification[] = [
  {
    id: 'aws-saa',
    name: 'AWS Certified Solutions Architect – Associate',
    shortName: 'AWS SAA',
    vendor: 'AWS',
    aliases: [
      'saa',
      'saa-c03',
      'saa-c02',
      'aws saa',
      'aws certified solutions architect associate',
      'aws solutions architect associate',
      'aws solution architect associate',
      'solutions architect associate',
      'solution architect associate',
    ],
  },
  {
    id: 'aws-dva',
    name: 'AWS Certified Developer – Associate',
    shortName: 'AWS DVA',
    vendor: 'AWS',
    aliases: [
      'dva',
      'dva-c02',
      'dva-c01',
      'aws dva',
      'aws certified developer associate',
      'aws developer associate',
      'certified developer associate',
    ],
  },
  {
    id: 'aws-sap',
    name: 'AWS Certified Solutions Architect – Professional',
    shortName: 'AWS SAP',
    vendor: 'AWS',
    aliases: [
      'sap-c02',
      'sap-c01',
      'aws sap',
      'aws certified solutions architect professional',
      'aws solutions architect professional',
      'aws solution architect professional',
      'solutions architect professional',
      'solution architect professional',
    ],
  },
  {
    id: 'az-900',
    name: 'Microsoft Certified: Azure Fundamentals (AZ-900)',
    shortName: 'AZ-900',
    vendor: 'Microsoft Azure',
    aliases: ['az-900', 'azure fundamentals', 'microsoft azure fundamentals'],
  },
  {
    id: 'az-104',
    name: 'Microsoft Certified: Azure Administrator Associate (AZ-104)',
    shortName: 'AZ-104',
    vendor: 'Microsoft Azure',
    aliases: ['az-104', 'azure administrator associate', 'azure admin associate'],
  },
  {
    id: 'gcp-ace',
    name: 'Google Cloud Associate Cloud Engineer',
    shortName: 'GCP ACE',
    vendor: 'Google Cloud',
    aliases: [
      'gcp ace',
      'google ace',
      'associate cloud engineer',
      'gcp associate cloud engineer',
      'google cloud associate cloud engineer',
    ],
  },
  {
    id: 'gcp-pca',
    name: 'Google Cloud Professional Cloud Architect',
    shortName: 'GCP PCA',
    vendor: 'Google Cloud',
    aliases: [
      'gcp pca',
      'google pca',
      'professional cloud architect',
      'gcp professional cloud architect',
      'google cloud professional cloud architect',
    ],
  },
  {
    id: 'cka',
    name: 'Certified Kubernetes Administrator (CKA)',
    shortName: 'CKA',
    vendor: 'CNCF / Linux Foundation',
    aliases: ['cka', 'certified kubernetes administrator'],
  },
  {
    id: 'ckad',
    name: 'Certified Kubernetes Application Developer (CKAD)',
    shortName: 'CKAD',
    vendor: 'CNCF / Linux Foundation',
    aliases: ['ckad', 'certified kubernetes application developer'],
  },
  {
    id: 'istqb-ctfl',
    name: 'ISTQB Certified Tester Foundation Level (CTFL)',
    shortName: 'ISTQB FL',
    vendor: 'ISTQB',
    aliases: [
      'istqb',
      'ctfl',
      'istqb foundation',
      'istqb foundation level',
      'istqb ctfl',
      'certified tester foundation level',
    ],
  },
  {
    id: 'ccna',
    name: 'Cisco Certified Network Associate (CCNA)',
    shortName: 'CCNA',
    vendor: 'Cisco',
    aliases: ['ccna', 'cisco ccna', 'cisco certified network associate', '200-301'],
  },
  {
    id: 'comptia-security-plus',
    name: 'CompTIA Security+',
    shortName: 'Security+',
    vendor: 'CompTIA',
    aliases: ['security+', 'sec+', 'comptia security+', 'sy0-701', 'sy0-601'],
  },
];

