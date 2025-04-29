import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { c, ConfigJS, jsonDriver } from "../src/ConfigJS";
import fs from 'node:fs';
import { setTimeout } from 'node:timers/promises';

// Helper functions for test files
const cleanupTestFiles = () => {
  if (fs.existsSync('test.json')) fs.unlinkSync('test.json');
  if (fs.existsSync('test2.json')) fs.unlinkSync('test2.json');
};

const createTestFile = (content: object = {}, filename: string = 'test.json') => {
  fs.writeFileSync(filename, JSON.stringify(content));
};

const getTestConfig = () => {
  return new ConfigJS(jsonDriver, {
    test: c.string(),
    valor: {
      valor: c.string(),
      numero: c.number().optional(),
    },
    ativo: c.boolean(),
    lista: c.array(c.string()),
  });
};

const delayBetweenTests = async () => {
  await setTimeout(100); // 100ms delay
};

describe('ConfigJS with JsonDriver', () => {
  afterEach(async () => {
    cleanupTestFiles();
    await delayBetweenTests();
  });

  describe('Initialization', () => {
    test('should create a new instance with schema', async () => {
      const config = getTestConfig();
      expect(config).toBeInstanceOf(ConfigJS);
      await delayBetweenTests();
    });
  });

  describe('load()', () => {
    test('should load values from JSON file', async () => {
      createTestFile({ test: "loaded", "valor.valor": "loaded_valor" });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(config.get('test')).toBe('loaded');
      expect(config.get('valor.valor')).toBe('loaded_valor');
      await delayBetweenTests();
    });

    test('should use default values when JSON file is empty', async () => {
      const config = new ConfigJS(jsonDriver, {
        test: c.string().default('default_value')
      });
      config.load({ filepath: 'test.json' });
      
      expect(config.get('test')).toBe('default_value');
      await delayBetweenTests();
    });

    test('should handle empty file by creating it with empty object', async () => {
      fs.writeFileSync('test.json', '');
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(config.get('test')).toBeUndefined();
      expect(fs.readFileSync('test.json', 'utf8')).toBe('{}');
      await delayBetweenTests();
    });

    test('should create file if it doesnt exist', async () => {
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(fs.existsSync('test.json')).toBe(true);
      expect(JSON.parse(fs.readFileSync('test.json', 'utf8'))).toEqual({});
      await delayBetweenTests();
    });
  });

  describe('get()', () => {
    test('should get string value', async () => {
      createTestFile({ test: "example" });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(config.get('test')).toBe('example');
      await delayBetweenTests();
    });

    test('should get nested value', async () => {
      createTestFile({ "valor.valor": "nested" });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(config.get('valor.valor')).toBe('nested');
      await delayBetweenTests();
    });

    test('should get boolean value', async () => {
      createTestFile({ ativo: true });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(config.get('ativo')).toBe(true);
      await delayBetweenTests();
    });

    test('should get array value', async () => {
      createTestFile({ lista: ["a", "b", "c"] });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(config.get('lista')).toEqual(['a', 'b', 'c']);
      await delayBetweenTests();
    });

    test('should throw for invalid key', async () => {
      const config = getTestConfig();
      expect(() => config.get('invalid.key' as never)).toThrow();
      await delayBetweenTests();
    });

    test('should return undefined for optional fields', async () => {
      createTestFile({ test: "value" });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(config.get('valor.numero' as never)).toBeUndefined();
      await delayBetweenTests();
    });
  });

  describe('set()', () => {
    test('should set string value', async () => {
      createTestFile({});
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      config.set('test', 'new_value');
      
      expect(config.get('test')).toBe('new_value');
      expect(JSON.parse(fs.readFileSync('test.json', 'utf8'))).toHaveProperty('test', 'new_value');
      await delayBetweenTests();
    });

    test('should set nested value', async () => {
      createTestFile({});
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      config.set('valor.valor', 'new_nested');
      
      expect(config.get('valor.valor')).toBe('new_nested');
      expect(fs.readFileSync('test.json', 'utf8')).toContain('\"valor.valor\": \"new_nested\"');
      await delayBetweenTests();
    });

    test('should set boolean value', async () => {
      createTestFile({});
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      config.set('ativo', true);
      
      expect(config.get('ativo')).toBe(true);
      expect(JSON.parse(fs.readFileSync('test.json', 'utf8'))).toHaveProperty('ativo', true);
      await delayBetweenTests();
    });

    test('should set array value', async () => {
      createTestFile({});
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      config.set('lista', ['x', 'y', 'z']);
      
      expect(config.get('lista')).toEqual(['x', 'y', 'z']);
      expect(JSON.parse(fs.readFileSync('test.json', 'utf8'))).toHaveProperty('lista', ['x', 'y', 'z']);
      await delayBetweenTests();
    });

    test('should throw when setting invalid value', async () => {
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(() => config.set('test', 123 as any)).toThrow();
      await delayBetweenTests();
    });
  });

  describe('define()', () => {
    test('should define multiple values at once', async () => {
      createTestFile({});
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      config.define({
        test: 'defined',
        valor: {
          valor: 'defined_nested'
        }
      });
      
      expect(config.get('test')).toBe('defined');
      expect(config.get('valor.valor')).toBe('defined_nested');
      const fileContent = fs.readFileSync('test.json', 'utf8');
      expect(fileContent).toContain('\"test\": \"defined\"');
      expect(fileContent).toContain('\"valor.valor\": \"defined_nested\"');
      await delayBetweenTests();
    });

    test('should override existing values', async () => {
      createTestFile({ test: "old_value" });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      config.define({ test: 'new_value' });
      
      expect(config.get('test')).toBe('new_value');
      await delayBetweenTests();
    });
  });

  describe('root()', () => {
    test('should get root object values', async () => {
      createTestFile({ test: "root_test", "valor.valor": "root_valor" });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      const root = config.root('valor');
      expect(root).toEqual({
        valor: "root_valor",
        numero: undefined
      });
      await delayBetweenTests();
    });

    test('should return undefined for non-existent root', async () => {
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(() => config.root('nonexistent' as any)).toThrow();
      await delayBetweenTests();
    });
  });

  describe('all()', () => {
    test('should get all values', async () => {
      createTestFile({ test: "all_test", "valor.valor": "all_valor" });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      const all = config.all();
      expect(all).toEqual({
        test: 'all_test',
        valor: {
          valor: 'all_valor',
          numero: undefined
        },
        ativo: undefined as never,
        lista: undefined as never
      });
      await delayBetweenTests();
    });

    test('should return empty structure for empty config', async () => {
      createTestFile({});
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      const all = config.all();
      expect(all).toEqual({
        test: undefined as never,
        valor: {
          valor: undefined as never,
          numero: undefined
        },
        ativo: undefined as never,
        lista: undefined as never
      });
      await delayBetweenTests();
    });
  });

  describe('insert()', () => {
    test('should insert values into root key', async () => {
      createTestFile({});
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      config.insert('valor', {
        valor: 'inserted',
        numero: 42
      });
      
      expect(config.get('valor.valor')).toBe('inserted');
      expect(config.get('valor.numero' as never)).toBe(42 as never);
      const fileContent = fs.readFileSync('test.json', 'utf8');
      expect(fileContent).toContain('\"valor.valor\": \"inserted\"');
      expect(fileContent).toContain('\"valor.numero\": 42');
      await delayBetweenTests();
    });

    test('should handle partial inserts', async () => {
      createTestFile({});
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      config.insert('valor', { valor: 'partial' });
      
      expect(config.get('valor.valor')).toBe('partial');
      expect(config.get('valor.numero' as never)).toBeUndefined();
      await delayBetweenTests();
    });
  });

  describe('has()', () => {
    test('should return true for existing key', async () => {
      createTestFile({ test: "exists" });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(config.has('test')).toBe(true);
      await delayBetweenTests();
    });

    test('should return false for non-existing key', async () => {
      createTestFile({});
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(config.has('test')).toBe(false);
      await delayBetweenTests();
    });

    test('should check nested keys', async () => {
      createTestFile({ "valor.valor": "exists" });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
    
      expect(config.has('valor.valor')).toBe(true);
      expect(config.has('valor.numero' as never)).toBe(false);
      await delayBetweenTests();
    });
  });

  describe('filepath change', () => {
    test('should switch to new filepath', async () => {
      createTestFile({ test: "file1" });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      // Change filepath and create new file
      createTestFile({ test: "file2" }, 'test2.json');
      config.load({ filepath: 'test2.json' });
      expect(config.get('test')).toBe('file2');
      await delayBetweenTests();
    });

    test('should maintain separate files', async () => {
      createTestFile({ test: "file1" });
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      createTestFile({ test: "file2" }, 'test2.json');
      config.load({ filepath: 'test2.json' });
      
      expect(JSON.parse(fs.readFileSync('test.json', 'utf8'))).toHaveProperty('test', 'file1');
      expect(JSON.parse(fs.readFileSync('test2.json', 'utf8'))).toHaveProperty('test', 'file2');
      await delayBetweenTests();
    });
  });

  describe('validation', () => {
    test('should validate string values', async () => {
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(() => {
        config.set('test', 123 as any);
      }).toThrow();
      await delayBetweenTests();
    });

    test('should validate number values', async () => {
      const config = new ConfigJS(jsonDriver, {
        age: c.number()
      });
      config.load({ filepath: 'test.json' });
      
      expect(() => {
        config.set('age', 'not_a_number' as any);
      }).toThrow();
      await delayBetweenTests();
    });

    test('should validate array values', async () => {
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(() => {
        config.set('lista', 'not_an_array' as any);
      }).toThrow();
      await delayBetweenTests();
    });

    test('should validate nested structures', async () => {
      const config = getTestConfig();
      config.load({ filepath: 'test.json' });
      
      expect(() => {
        config.set('valor' as never, { valor: 123 } as never);
      }).toThrow();
      await delayBetweenTests();
    });
  });

  describe('pretty print', () => {
    test('should format JSON with indentation when pretty is true', async () => {
      const config = getTestConfig();
      config.load({ 
        filepath: 'test.json',
        pretty: true
      });
      config.set('test', 'pretty_value');
      
      const fileContent = fs.readFileSync('test.json', 'utf8');
      expect(fileContent).toMatch(/^\{\n {2}"test"/);
      await delayBetweenTests();
    });

    test('should write compact JSON when pretty is false', async () => {
      const config = getTestConfig();
      config.load({ 
        filepath: 'test.json',
        pretty: false
      });
      config.set('test', 'compact_value');
      
      const fileContent = fs.readFileSync('test.json', 'utf8');
      expect(fileContent).toMatch(/^\{"test"/);
      await delayBetweenTests();
    });

    test('should use custom indentation when pretty is a number', async () => {
      const config = getTestConfig();
      config.load({ 
        filepath: 'test.json',
        pretty: 4
      });
      config.set('test', 'indented_value');
      
      const fileContent = fs.readFileSync('test.json', 'utf8');
      expect(fileContent).toMatch(/^\{\n {4}"test"/);
      await delayBetweenTests();
    });

    test('should default to pretty format when pretty is undefined', async () => {
      const config = getTestConfig();
      config.load({ 
        filepath: 'test.json'
      });
      config.set('test', 'default_pretty_value');
      
      const fileContent = fs.readFileSync('test.json', 'utf8');
      expect(fileContent).toMatch(/^\{\n {2}"test"/);
      await delayBetweenTests();
    });
  });
});