import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { c, ConfigJS, envDriver } from '../src/ConfigJS';
import fs from 'fs';

enum AppEnvironment {
  DEVELOPMENT = 'dev',
  PRODUCTION = 'prod',
  STAGING = 'staging'
}

// Função auxiliar para limpar o arquivo .env
function cleanEnvFile() {
  if (fs.existsSync('.env')) {
    fs.unlinkSync('.env');
  }
}

describe('ConfigJS', () => {
  // Configuração de teste reutilizável
  const testSchema = {
    app: {
      name: c.string().default('MyApp'),
      version: c.string().regex(/\d+\.\d+\.\d+/).default('1.0.0'),
      env: c.enum(AppEnvironment).default(AppEnvironment.DEVELOPMENT),
      debug: c.boolean().default(false)
    },
    server: {
      port: c.number().min(1024).max(65535).default(3000),
      host: c.string().default('localhost'),
      ssl: c.boolean().default(false),
      cors: {
        enabled: c.boolean().default(true),
        origins: c.array(c.string()).default(['localhost'])
      }
    },
    database: {
      url: c.string().default('mongodb://localhost:27017'),
      name: c.string().default('appdb'),
      timeout: c.number().default(5000),
      retries: c.number().default(3)
    },
    features: {
      analytics: c.boolean().default(true),
      logging: {
        level: c.enum(['error', 'warn', 'info', 'debug']).default('info'),
        format: c.string().default('json')
      }
    }
  };

  beforeEach(() => {
    cleanEnvFile();
  });

  afterEach(() => {
    cleanEnvFile();
  });

  test('deve carregar valores padrão corretamente', () => {
    const config = new ConfigJS(envDriver, testSchema);
    
    expect(config.get('app.name')).toBe('MyApp');
    expect(config.get('server.port')).toBe(3000);
    expect(config.get('database.url')).toBe('mongodb://localhost:27017');
    expect(config.get('features.analytics')).toBe(true);
  });

  test('deve permitir a modificação de valores', () => {
    const config = new ConfigJS(envDriver, testSchema);
    
    config.set('app.name', 'MyAwesomeApp');
    config.set('server.port', 8080);
    config.set('database.url', 'mongodb://prod-db:27017');
    config.set('features.analytics', false);
    
    expect(config.get('app.name')).toBe('MyAwesomeApp');
    expect(config.get('server.port')).toBe(8080);
    expect(config.get('database.url')).toBe('mongodb://prod-db:27017');
    expect(config.get('features.analytics')).toBe(false);
  });

  test('deve validar valores de acordo com o schema', () => {
    const config = new ConfigJS(envDriver, testSchema);
    // Teste para número fora do range
    expect(() => config.set('server.port', 80)).toThrow();
    
    // Teste para enum inválido
    expect(() => config.set('app.env', 'invalid' as never)).toThrow();
    
    // Teste para regex inválido
    expect(() => config.set('app.version', '1.0')).toThrow();
    
    // Teste para tipo inválido
    expect(() => config.set('server.port', 'not-a-number' as never)).toThrow();
  });

  test('deve persistir e carregar configurações do arquivo .env', () => {
    // Criar configuração inicial e modificar valores
    const initialConfig = new ConfigJS(envDriver, testSchema);
    initialConfig.set('app.name', 'AppFromTest');
    initialConfig.set('server.port', 9090);
    initialConfig.save();
    
    // Verificar se o arquivo .env foi criado
    expect(fs.existsSync('.env')).toBe(true);
    
    // Criar nova instância para simular novo carregamento
    const loadedConfig = new ConfigJS(envDriver, testSchema);
    loadedConfig.load();
    
    expect(loadedConfig.get('app.name')).toBe('AppFromTest');
    expect(loadedConfig.get('server.port')).toBe(9090);
  });

  test('deve lidar com arrays e objetos complexos', () => {
    const complexSchema = {
      auth: {
        providers: c.array(c.object({
          name: c.string(),
          clientId: c.string(),
          secret: c.string(),
          scopes: c.array(c.string())
        })).default([])
      }
    };
    
    const config = new ConfigJS(envDriver, complexSchema);
    
    const providers = [
      {
        name: 'google',
        clientId: 'google-client-id',
        secret: 'google-secret',
        scopes: ['email', 'profile']
      }
    ];
    
    config.set('auth.providers', providers);
    expect(config.get('auth.providers')).toEqual(providers);
    
    // Testar persistência e recarregamento
    config.save();
    
    const newConfig = new ConfigJS(envDriver, complexSchema);
    newConfig.load();
    
    expect(newConfig.get('auth.providers')).toEqual(providers);
  });

  test('método root deve retornar subconfiguração completa', () => {
    const config = new ConfigJS(envDriver, testSchema);
    
    const serverConfig = config.root('server');
    expect(serverConfig).toEqual({
      port: 3000,
      host: 'localhost',
      ssl: false,
      cors: {
        enabled: true,
        origins: ['localhost']
      }
    });
  });

  test('método insert deve atualizar valores existentes', () => {
    const config = new ConfigJS(envDriver, testSchema);
    
    config.insert('features', {
      analytics: false,
      logging: {
        level: 'debug'
      }
    });
    
    expect(config.get('features.analytics')).toBe(false);
    expect(config.get('features.logging.level')).toBe('debug');
    // Deve manter outros valores não especificados
    expect(config.get('features.logging.format')).toBe('json');
  });

  test('método has deve verificar existência de chaves', () => {
    const config = new ConfigJS(envDriver, testSchema);
    
    expect(config.has('app.name')).toBe(true);
    expect(config.has('database.fake' as never)).toBe(false);
    expect(config.has('server.cors.enabled')).toBe(true);
  });

  test('método keys deve listar todas as chaves disponíveis', () => {
    const config = new ConfigJS(envDriver, testSchema);
    
    const keys = config.keys();
    expect(keys).toContain('app.name');
    expect(keys).toContain('server.port');
    expect(keys).toContain('database.url');
    expect(keys).toContain('features.logging.level');
  });

  test('deve lidar com erros de digitação em .env', () => {
    // Criar um arquivo .env com erros
    fs.writeFileSync('.env', `
      app.name="AppFromEnv"
      server.port="not-a-number"
      server.cors.origions="[\"example.com\"]" # Erro de digitação
    `);
    
    const config = new ConfigJS(envDriver, testSchema);
    
    // Deve lançar erro para tipo inválido
    expect(() => config.load()).toThrow();
    
    // Corrigir o erro de tipo e testar o erro de digitação
    fs.writeFileSync('.env', `
      app.name="AppFromEnv"
      server.port="8443"
      server.cors.origions="[\"example.com\"]" # Erro de digitação
    `);
    
    config.load();
    expect(config.get('app.name')).toBe('AppFromEnv');
    expect(() => config.get('server.cors.origions' as never)).toThrow();
  });
});