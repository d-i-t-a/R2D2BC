/*
 * Copyright 2018-2026 DITA (AM Consulting LLC)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Typed errors for the Fetcher / Resource system.
 *
 * Every Fetcher implementation throws a ReadError subclass instead of
 * a generic Error. Callers that need to distinguish failure reasons
 * check `error.type`. Callers that don't just catch ReadError.
 *
 * Types:
 * - `access` — the resource couldn't be reached (HTTP 4xx/5xx,
 *   missing ZIP entry, network failure)
 * - `decoding` — the resource was reached but its content is
 *   invalid or corrupt (bad XML, unexpected format)
 * - `cancelled` — the request was aborted (navigated away,
 *   AbortController.abort())
 */
export type ReadErrorType = "access" | "decoding" | "cancelled";

export class ReadError extends Error {
  readonly type: ReadErrorType;
  readonly href?: string;
  readonly statusCode?: number;
  readonly cause?: Error;

  constructor(opts: {
    type: ReadErrorType;
    message: string;
    href?: string;
    statusCode?: number;
    cause?: Error;
  }) {
    super(opts.message);
    this.name = "ReadError";
    this.type = opts.type;
    this.href = opts.href;
    this.statusCode = opts.statusCode;
    this.cause = opts.cause;
  }

  /** Resource not found or unreachable. */
  static access(href: string, message: string, statusCode?: number): ReadError {
    return new ReadError({
      type: "access",
      message,
      href,
      statusCode,
    });
  }

  /** Content is corrupt or can't be decoded. */
  static decoding(href: string, message: string, cause?: Error): ReadError {
    return new ReadError({
      type: "decoding",
      message,
      href,
      cause,
    });
  }

  /** Request was cancelled. */
  static cancelled(href: string): ReadError {
    return new ReadError({
      type: "cancelled",
      message: `Request cancelled: ${href}`,
      href,
    });
  }
}
