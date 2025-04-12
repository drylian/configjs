// string-shape.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { BaseShape } from './base-shape';
import { ConfigShapeError } from '../error';

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

  min(length: number): this {
    this._min = length;
    return this.refine(
      (val) => val.length >= length,
      `String must be at least ${length} characters long`,
      'STRING_TOO_SHORT',
      {
        min: length
      }
    );
  }

  max(length: number): this {
    this._max = length;
    return this.refine(
      (val) => val.length <= length,
      `String must be at most ${length} characters long`,
      'STRING_TOO_LONG',
      {
        max: length
      }
    );
  }

  length(length: number): this {
    return this.refine(
      (val) => val.length === length,
      `String must be exactly ${length} characters long`,
      'STRING_LENGTH_MISMATCH',
      {
        length
      }
    );
  }

  coerce(): this {
    this._coerce = true;
    return this;
  }

  regex(pattern: RegExp): this {
    return this.refine(
      (val) => pattern.test(val),
      `String must match pattern ${pattern}`,
      'REGEX_MISMATCH',
      {
        regex: pattern.source
      }
    );
  }

  email(): this {
    this._email = true;
    return this.refine(
      (val) => /^[a-zA-Z0-9.!#$%&'*+\=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(val),
      `Email is invalid`,
      'INVALID_EMAIL'
    );
  }

  url(): this {
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
      `URL is invalid`,
      'INVALID_URL'
    );
  }

  uuid(): this {
    this._uuid = true;
    return this.refine(
      (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val),
      `UUID is invalid`,
      'INVALID_UUID'
    );
  }

  creditCard(): this {
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
      `Credit card number is invalid`,
      'INVALID_CREDIT_CARD'
    );
  }

  hexColor(): this {
    this._hexColor = true;
    return this.refine(
      (val) => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val),
      `Hex color is invalid`,
      'INVALID_HEX_COLOR'
    );
  }

  ipAddress(): this {
    this._ipAddress = true;
    return this.refine(
      (val) => {
        // IPv4 or IPv6
        return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(val) || 
               /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/.test(val);
      },
      `IP address is invalid`,
      'INVALID_IP_ADDRESS'
    );
  }

  isoDate(): this {
    this._isoDate = true;
    return this.refine(
      (val) => !isNaN(Date.parse(val)) && new Date(val).toISOString() === val,
      `Date must be in ISO format`,
      'INVALID_ISO_DATE'
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

  alphanumeric(): this {
    this._alphanumeric = true;
    return this.refine(
      (val) => /^[a-zA-Z0-9]+$/.test(val),
      `String must contain only alphanumeric characters`,
      'INVALID_ALPHANUMERIC'
    );
  }

  contains(substring: string): this {
    this._contains = substring;
    return this.refine(
      (val) => val.includes(substring),
      `String must contain "${substring}"`,
      'MISSING_SUBSTRING'
    );
  }

  startsWith(prefix: string): this {
    this._startsWith = prefix;
    return this.refine(
      (val) => val.startsWith(prefix),
      `String must start with "${prefix}"`,
      'MISSING_PREFIX'
    );
  }

  endsWith(suffix: string): this {
    this._endsWith = suffix;
    return this.refine(
      (val) => val.endsWith(suffix),
      `String must end with "${suffix}"`,
      'MISSING_SUFFIX'
    );
  }

  oneOf(options: string[]): this {
    return this.refine(
      (val) => options.includes(val),
      `String must be one of: ${options.join(', ')}`,
      'VALUE_NOT_IN_OPTIONS',
      {
        options
      }
    );
  }

  notEmpty(): this {
    return this.refine(
      (val) => val.length > 0,
      `String must not be empty`,
      'EMPTY_STRING'
    );
  }

  asNumber(): this {
    return this.refine(
      (val) => !isNaN(parseFloat(val)),
      `String must represent a valid number`,
      'INVALID_NUMBER_STRING'
    );
  }

  asInteger(): this {
    return this.refine(
      (val) => /^-?\d+$/.test(val),
      `String must represent a valid integer`,
      'INVALID_INTEGER_STRING'
    );
  }

  asBoolean(): this {
    return this.refine(
      (val) => ['true', 'false', '1', '0'].includes(val.toLowerCase()),
      `String must represent a boolean (true/false/1/0)`,
      'INVALID_BOOLEAN_STRING'
    );
  }

  asJson(): this {
    return this.refine(
      (val) => {
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      `String must be valid JSON`,
      'INVALID_JSON'
    );
  }
}