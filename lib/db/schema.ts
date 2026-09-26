import Dexie, { type Table } from 'dexie';

export interface ProgramHeader {
  time?: string;
  theme?: string;
  cantor?: string;
  celebrant?: string;
  otReader?: string;
  ntReader?: string;
  psalmReader?: string;
  epistleReader?: string;
  gospelReader?: string;
  intercessionLeader?: string;
  preacher?: string;
}

export interface Program {
  id: string;
  workspaceId: string;
  title: string;
  serviceDate: string;
  status: 'draft' | 'ready' | 'generated';
  header?: ProgramHeader; // all fields optional — many churches won't use most of these (Part C)
  createdAt: string;
  expiresAt: string;
}

export interface Section {
  id: string;
  programId: string;
  order: number;
  type: 'welcome' | 'hymn' | 'reading' | 'psalm' | 'creed' | 'collect' | 'sermon' | 'benediction' | 'response' | 'other';
  title: string;
  reference?: string; // for hymns: the book code + number, e.g. "CONH 418"; for readings/psalm: the Bible reference
  readerName?: string; // who's reading/leading this item — cross-referenced from the header block where available
  fullText?: string;
  resolvedContentId?: string;
  resolved: boolean;
}

export interface ContentItem {
  id: string;
  type: 'bible' | 'hymn' | 'collect' | 'creed';
  key: string;
  translation?: string;
  title: string;
  body: string;
  source: 'bundled' | 'fetched';
  updatedAt: string;
}

export interface HymnalEdition {
  id: string;
  name: string;
  region?: string;
}

export interface HymnNumbering {
  id: string;
  hymnalEditionId: string;
  number: number;
  contentId: string;
}

export interface Deck {
  id: string;
  programId: string;
  fileBlob: Blob;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
}

class SanctumDB extends Dexie {
  programs!: Table<Program, string>;
  sections!: Table<Section, string>;
  contentLibrary!: Table<ContentItem, string>;
  hymnalEditions!: Table<HymnalEdition, string>;
  hymnNumbering!: Table<HymnNumbering, string>;
  decks!: Table<Deck, string>;

  constructor() {
    super('SanctumDB');
    this.version(1).stores({
      programs: 'id, workspaceId, serviceDate, expiresAt',
      sections: 'id, programId, order, resolved',
      contentLibrary: 'id, type, key',
      decks: 'id, programId, expiresAt',
    });
    this.version(2).stores({
      contentLibrary: 'id, type, key, translation',
      hymnalEditions: 'id, name',
      hymnNumbering: 'id, [hymnalEditionId+number], contentId',
    });
    // v3: Program.header and Section.readerName are plain object/string
    // fields, not indexed — no store definition change needed, Dexie
    // handles new non-indexed fields on existing tables automatically.
  }
}

export const db = new SanctumDB();