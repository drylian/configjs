// string-shape.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { BaseShape } from './base-shape';
import type { COptionsConfig } from '../types';

export class StringShape extends BaseShape<string> {
  public readonly _type = "string";
  public _min?: number;
  public _max?: number;
  public _email?: boolean = false;
  public _url?: boolean = false;
  public _uuid?: boolean = false;
  public _creditCard?: boolean = false;
  public _hexColor?: boolean = false;
  public _ipAddress?: boolean = false;
  public _isoDate?: boolean = false;
  public _trimmed?: boolean = false;
  public _lowercase?: boolean = false;
  public _uppercase?: boolean = false;
  public _alphanumeric?: boolean = false;
  public _contains?: string;
  public _startsWith?: string;
  public _endsWith?: string;
  private _cryptoSecret?: string;
  private _cryptoAlgorithm: 'aes-256-cbc' | 'aes-256-gcm' = 'aes-256-cbc';
  private _cryptoMarker: string = 'ENC:';

  crypt(secret: string, algorithm: 'aes-256-cbc' | 'aes-256-gcm' = 'aes-256-cbc', marker: string = 'ENC:'): this {
    if (secret.length < 32) {
      this.createError((v, p) => ({
        code: 'INVALID_CRYPTO_SECRET',
        path: p || '',
        message: 'Encryption secret must be at least 32 characters long for AES-256',
        value: secret
      }), secret);
    }

    this._cryptoSecret = secret;
    this._cryptoAlgorithm = algorithm;
    this._cryptoMarker = marker;

    this.transform((value: string) => {
      if (!this._cryptoSecret) return value;

      try {
        if (value.startsWith(this._cryptoMarker)) {
          return this._decrypt(value.slice(this._cryptoMarker.length));
        }
        return this._cryptoMarker + this._encrypt(value);
      } catch (e) {
        this.createError((v, p) => ({
          code: 'CRYPTO_OPERATION_FAILED',
          path: p || '',
          message: e instanceof Error ? e.message : 'Crypto operation failed',
          value,
          meta: {
            operation: value.startsWith(this._cryptoMarker) ? 'decrypt' : 'encrypt'
          }
        }), value);
      }
    }, {});

    return this;
  }

  private _encrypt(value: string): string {
    if (!this._cryptoSecret) return value;

    const iv = randomBytes(16);
    const cipher = createCipheriv(this._cryptoAlgorithm, this._cryptoSecret, iv);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private _decrypt(encryptedValue: string): string {
    if (!this._cryptoSecret) return encryptedValue;

    const [ivHex, encryptedData] = encryptedValue.split(':');
    if (!ivHex || !encryptedData) {
      this.createError((v, p) => ({
        code: 'INVALID_ENCRYPTED_FORMAT',
        path: p || '',
        message: 'Invalid encrypted value format',
        value: encryptedValue,
        meta: {
          expectedFormat: 'IV_HEX:ENCRYPTED_DATA'
        }
      }), encryptedValue);
    }

    try {
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = createDecipheriv(this._cryptoAlgorithm, this._cryptoSecret, iv);
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (e) {
      this.createError((v, p) => ({
        code: 'DECRYPTION_FAILED',
        path: p || '',
        message: e instanceof Error ? e.message : 'Decryption failed',
        value: encryptedValue,
        meta: {
          algorithm: this._cryptoAlgorithm
        }
      }), encryptedValue);
    }
  }

  private _coerce = false;

  parse(value: unknown): string {
    if (typeof value === "undefined" && this._default) value = this._default;
    if (typeof value === "undefined" && this._optional) return undefined as never;
    if (value === null && this._nullable) return null as never;
    
    if (this._coerce) {
      if (value === null || value === undefined) {
        value = '';
      } else if (typeof value === 'boolean' || typeof value === 'number') {
        value = String(value);
      } else if (typeof value === 'object') {
        value = JSON.stringify(value);
      } else {
        value = String(value);
      }
    }

    if (typeof value !== 'string') {
      this.createError((v, p) => ({
        code: 'NOT_STRING',
        path: p || '',
        message: 'Expected a string',
        value: v
      }), value);
    }

    let result = value as string;

    // Apply transformations
    if (this._trimmed) {
      result = result.trim();
    }
    if (this._lowercase) {
      result = result.toLowerCase();
    }
    if (this._uppercase) {
      result = result.toUpperCase();
    }

    return this._checkImportant(this._applyOperations(result, this._key));
  }

  min(length: number, opts: COptionsConfig = {}): this {
    this._min = length;
    return this.refine(
      (val) => val.length >= length,
      opts.message ?? `String must be at least ${length} characters long`,
      opts.code ?? 'STRING_TOO_SHORT',
      opts.meta ?? {
        min: length
      }
    );
  }

  max(length: number, opts: COptionsConfig = {}): this {
    this._max = length;
    return this.refine(
      (val) => val.length <= length,
      opts.message ?? `String must be at most ${length} characters long`,
      opts.code ?? 'STRING_TOO_LONG',
      opts.meta ?? {
        max: length
      }
    );
  }

  length(length: number, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => val.length === length,
      opts.message ?? `String must be exactly ${length} characters long`,
      opts.code ?? 'STRING_LENGTH_MISMATCH',
      opts.meta ?? {
        length
      }
    );
  }

  coerce(): this {
    this._coerce = true;
    return this;
  }

  regex(pattern: RegExp, opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => pattern.test(val),
      opts.message ?? `String must match pattern ${pattern}`,
      opts.code ?? 'REGEX_MISMATCH',
      opts.meta ?? {
        regex: pattern.source
      }
    );
  }

  email(opts: COptionsConfig = {}): this {
    this._email = true;
    return this.refine(
      (val) => /^[a-zA-Z0-9.!#$%&'*+\=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(val),
      opts.message ?? `Email is invalid`,
      opts.code ?? 'INVALID_EMAIL',
      opts.meta
    );
  }

  url(opts: COptionsConfig = {}): this {
    this._url = true;
    return this.refine(
      (val) => {
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      opts.message ?? `URL is invalid`,
      opts.code ?? 'INVALID_URL',
      opts.meta
    );
  }

  uuid(opts: COptionsConfig = {}): this {
    this._uuid = true;
    return this.refine(
      (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val),
      opts.message ?? `UUID is invalid`,
      opts.code ?? 'INVALID_UUID',
      opts.meta
    );
  }

  creditCard(opts: COptionsConfig = {}): this {
    this._creditCard = true;
    return this.refine(
      (val) => {
        // Luhn algorithm check for credit cards
        const sanitized = val.replace(/\D/g, '');
        if (!/^[0-9]{13,19}$/.test(sanitized)) return false;
        
        let sum = 0;
        for (let i = 0; i < sanitized.length; i++) {
          let digit = parseInt(sanitized[i], 10);
          if ((i + sanitized.length) % 2 === 0) {
            digit *= 2;
            if (digit > 9) digit -= 9;
          }
          sum += digit;
        }
        return sum % 10 === 0;
      },
      opts.message ?? `Credit card number is invalid`,
      opts.code ?? 'INVALID_CREDIT_CARD',
      opts.meta
    );
  }

  hexColor(opts: COptionsConfig = {}): this {
    this._hexColor = true;
    return this.refine(
      (val) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val),
      opts.message ?? `Hex color is invalid`,
      opts.code ?? 'INVALID_HEX_COLOR',
      opts.meta
    );
  }

  ipAddress(opts: COptionsConfig = {}): this {
    this._ipAddress = true;
    return this.refine(
      (val) => {
        // IPv4 or IPv6
        return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(val) || 
               /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/.test(val);
      },
      opts.message ?? `IP address is invalid`,
      opts.code ?? 'INVALID_IP_ADDRESS',
      opts.meta
    );
  }

  isoDate(opts: COptionsConfig = {}): this {
    this._isoDate = true;
    return this.refine(
      (val) => !isNaN(Date.parse(val)) && new Date(val).toISOString() === val,
      opts.message ?? `Date must be in ISO format`,
      opts.code ?? 'INVALID_ISO_DATE',
      opts.meta
    );
  }

  trimmed(): this {
    this._trimmed = true;
    return this;
  }

  lowercase(): this {
    this._lowercase = true;
    return this;
  }

  uppercase(): this {
    this._uppercase = true;
    return this;
  }

  alphanumeric(opts: COptionsConfig = {}): this {
    this._alphanumeric = true;
    return this.refine(
      (val) => /^[a-zA-Z0-9]+$/.test(val),
      opts.message ?? `String must contain only alphanumeric characters`,
      opts.code ?? 'INVALID_ALPHANUMERIC',
      opts.meta
    );
  }

  contains(substring: string, opts: COptionsConfig = {}): this {
    this._contains = substring;
    return this.refine(
      (val) => val.includes(substring),
      opts.message ?? `String must contain "${substring}"`,
      opts.code ?? 'MISSING_SUBSTRING',
      opts.meta
    );
  }

  startsWith(prefix: string, opts: COptionsConfig = {}): this {
    this._startsWith = prefix;
    return this.refine(
      (val) => val.startsWith(prefix),
      opts.message ?? `String must start with "${prefix}"`,
      opts.code ?? 'MISSING_PREFIX',
      opts.meta
    );
  }

  endsWith(suffix: string, opts: COptionsConfig = {}): this {
    this._endsWith = suffix;
    return this.refine(
      (val) => val.endsWith(suffix),
      opts.message ?? `String must end with "${suffix}"`,
      opts.code ?? 'MISSING_SUFFIX',
      opts.meta
    );
  }

  includes(substring: string, opts: COptionsConfig = {}): this {
    return this.contains(substring, opts);
  }

  oneOf(options: string[], opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => options.includes(val),
      opts.message ?? `String must be one of: ${options.join(', ')}`,
      opts.code ?? 'VALUE_NOT_IN_OPTIONS',
      opts.meta ?? {
        options
      }
    );
  }

  notEmpty(opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => val.length > 0,
      opts.message ?? `String must not be empty`,
      opts.code ?? 'EMPTY_STRING',
      opts.meta
    );
  }

  asNumber(opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => !isNaN(parseFloat(val)),
      opts.message ?? `String must represent a valid number`,
      opts.code ?? 'INVALID_NUMBER_STRING',
      opts.meta
    );
  }

  asInteger(opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => /^-?\d+$/.test(val),
      opts.message ?? `String must represent a valid integer`,
      opts.code ?? 'INVALID_INTEGER_STRING',
      opts.meta
    );
  }

  asBoolean(opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => ['true', 'false', '1', '0'].includes(val.toLowerCase()),
      opts.message ?? `String must represent a boolean (true/false/1/0)`,
      opts.code ?? 'INVALID_BOOLEAN_STRING',
      opts.meta
    );
  }

  asJson(opts: COptionsConfig = {}): this {
    return this.refine(
      (val) => {
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      opts.message ?? `String must be valid JSON`,
      opts.code ?? 'INVALID_JSON',
      opts.meta
    );
  }
}