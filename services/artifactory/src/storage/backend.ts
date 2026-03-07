/**
 * Storage Backend Interface
 * 
 * Clean abstraction over blob storage. Primary implementation targets
 * Cloudflare R2 (S3-compatible, zero egress). Any S3-compatible storage
 * (MinIO, AWS S3, GCS, Azure Blob) can be swapped without changing
 * any other code in the system.
 */

export interface StorageEntry {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
  metadata: Record<string, string>;
}

export interface ListOptions {
  maxKeys?: number;
  continuationToken?: string;
  delimiter?: string;
}

export interface ListResult {
  entries: StorageEntry[];
  continuationToken?: string;
  isTruncated: boolean;
}

export interface PutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
}

export interface GetResult {
  data: Buffer;
  contentType: string;
  size: number;
  etag: string;
  metadata: Record<string, string>;
  lastModified: Date;
}

export interface HeadResult {
  size: number;
  contentType: string;
  etag: string;
  metadata: Record<string, string>;
  lastModified: Date;
}

/**
 * StorageBackend — The interface every storage implementation must satisfy.
 * 
 * Content-addressable by design: keys are typically content hashes.
 * This enables deduplication, integrity verification, and tamper detection.
 */
export interface StorageBackend {
  /** Store a blob with optional metadata */
  put(key: string, data: Buffer, options?: PutOptions): Promise<void>;

  /** Retrieve a blob by key */
  get(key: string): Promise<GetResult>;

  /** Check if a blob exists and get metadata without downloading */
  head(key: string): Promise<HeadResult | null>;

  /** Delete a blob */
  delete(key: string): Promise<void>;

  /** Delete multiple blobs */
  deleteMany(keys: string[]): Promise<void>;

  /** List blobs by prefix */
  list(prefix: string, options?: ListOptions): Promise<ListResult>;

  /** Copy a blob to a new key (for promotion, archival) */
  copy(sourceKey: string, destKey: string): Promise<void>;

  /** Generate a pre-signed URL for direct download (edge cache friendly) */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;

  /** Generate a pre-signed URL for direct upload */
  getSignedUploadUrl(key: string, expiresInSeconds: number, contentType?: string): Promise<string>;

  /** Check storage backend health */
  healthCheck(): Promise<boolean>;
}