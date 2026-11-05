/** One store key a login received. */
export interface StoredKey {
  readonly storeId: string;
  readonly storeName: string;
  readonly apiKey: string;
}

/** What a profile file holds. */
export interface ProfileCredentials {
  readonly label: string;
  readonly keys: readonly StoredKey[];
}
