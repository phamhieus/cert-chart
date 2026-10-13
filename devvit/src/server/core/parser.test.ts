import { describe, expect, it } from 'vitest';
import { detectCertifications, normalizeText } from './parser';

const expectCerts = (text: string): string[] => detectCertifications(text).sort();

describe('detectCertifications', () => {
  it('normalises exam codes and aliases to one certification', () => {
    expect(expectCerts('I just passed SAA-C03 last week!')).toEqual(['aws-saa']);
    expect(expectCerts('Studying for the AWS Certified Solutions Architect - Associate')).toEqual([
      'aws-saa',
    ]);
    expect(expectCerts('AWS-SAA or CKA?')).toEqual(['aws-saa', 'cka']);
  });

  it('matches hyphen, space and joined spellings of a code', () => {
    expect(expectCerts('az-900 then az104?')).toEqual(['az-104', 'az-900']);
    expect(expectCerts('AZ 900 is easy')).toEqual(['az-900']);
  });

  it('counts each certification once per item', () => {
    expect(detectCertifications('CKA, cka, Certified Kubernetes Administrator')).toEqual(['cka']);
  });

  it('keeps CKA and CKAD apart', () => {
    expect(expectCerts('cka and ckad bundle')).toEqual(['cka', 'ckad']);
    expect(expectCerts('CKAD tips please')).toEqual(['ckad']);
  });

  it('handles the + in Security+ without matching bare "security"', () => {
    expect(expectCerts('Security+ or sec+ renewal (SY0-701)')).toEqual(['comptia-security-plus']);
    expect(expectCerts('security is important')).toEqual([]);
  });

  it('does not fire on the ambiguous bare acronyms', () => {
    expect(expectCerts('We run SAP ERP at work and I hate it')).toEqual([]);
    expect(expectCerts('An ace up my sleeve, what a great ace')).toEqual([]);
    expect(expectCerts('Booked SAP-C02 for next month')).toEqual(['aws-sap']);
    expect(expectCerts('GCP ACE study group')).toEqual(['gcp-ace']);
  });

  it('returns nothing for empty or unrelated text', () => {
    expect(detectCertifications('')).toEqual([]);
    expect(detectCertifications('what laptop should I buy')).toEqual([]);
  });
});

describe('normalizeText', () => {
  it('collapses punctuation and unicode dashes but keeps codes intact', () => {
    expect(normalizeText('Solutions Architect – Associate!')).toBe(
      'solutions architect associate'
    );
    expect(normalizeText('  SAA-C03  ')).toBe('saa-c03');
  });
});
